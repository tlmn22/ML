import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createTestDb, createUser } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});

// Each test runs against a clean data set; the schema itself is created once.
beforeEach(async () => {
  await db.exec(`
    truncate auth.users, public.sync_jobs, public.audit_logs, public.heroes, public.articles cascade;
  `);
});

async function startAttempt(profileId: string, roleId = 111, zoneId = 2222, ip: string | null = null) {
  const { rows } = await db.query<{ out_attempt_id: string | null; out_error: string | null }>(
    `select * from public.mlbb_start_code_attempt($1, $2, $3, $4)`,
    [profileId, roleId, zoneId, ip],
  );
  return rows[0];
}

async function finalize(attemptId: string, profileId: string, rankLevel: number | null = 120) {
  const { rows } = await db.query<{ out_account_id: string; out_transferred_from: string | null }>(
    `select * from public.mlbb_finalize_verification(
       $1, $2, 'Nick', null, 'MN', 50, $3, 150, 'v1:enc', 'provider', '{"ok":true}'::jsonb,
       now() + interval '12 hours')`,
    [attemptId, profileId, rankLevel],
  );
  return rows[0];
}

async function verifyAccount(profileId: string, roleId = 111, zoneId = 2222, rankLevel = 120) {
  const attempt = await startAttempt(profileId, roleId, zoneId);
  await db.query(`select * from public.mlbb_begin_code_submission($1, $2)`, [attempt.out_attempt_id, profileId]);
  return finalize(attempt.out_attempt_id!, profileId, rankLevel);
}

describe("profiles", () => {
  it("creates a profile with a sanitized, unique username on signup", async () => {
    const a = await createUser(db, "Bat.Erdene@example.com");
    const b = await createUser(db, "baterdene@other.com");
    const { rows } = await db.query<{ id: string; username: string }>(
      `select id, username from public.profiles order by created_at`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.username]));
    expect(byId[a]).toBe("baterdene");
    expect(byId[b]).toMatch(/^baterdene_[a-f0-9]{5}$/);
  });

  it("lets users edit their own display fields but never their role", async () => {
    const id = await createUser(db, "user@example.com");
    await as(db, "authenticated", id, () =>
      db.query(`update public.profiles set display_name = 'Тэмүүлэн' where id = $1`, [id]),
    );
    await expect(
      as(db, "authenticated", id, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await db.query<{ role: string; display_name: string }>(
      `select role, display_name from public.profiles where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ role: "user", display_name: "Тэмүүлэн" });
  });

  it("does not let users edit someone else's profile", async () => {
    const a = await createUser(db, "a@example.com");
    const b = await createUser(db, "b@example.com");
    const result = await as(db, "authenticated", a, () =>
      db.query(`update public.profiles set display_name = 'hacked' where id = $1`, [b]),
    );
    expect(result.affectedRows).toBe(0);
  });
});

describe("secrets and server-only writes", () => {
  it("hides provider sessions from anon and authenticated users, even the owner", async () => {
    const id = await createUser(db, "owner@example.com");
    await verifyAccount(id);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        as(db, role, id, () => db.query(`select * from public.mlbb_provider_sessions`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("forbids clients from inserting accounts or snapshots", async () => {
    const id = await createUser(db, "faker@example.com");
    await expect(
      as(db, "authenticated", id, () =>
        db.query(
          `insert into public.mlbb_accounts (profile_id, role_id, zone_id, verification_method, data_source)
           values ($1, 1, 1, 'provider_code', 'provider')`,
          [id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("forbids clients from calling state-transition functions", async () => {
    const id = await createUser(db, "caller@example.com");
    await expect(
      as(db, "authenticated", id, () =>
        db.query(`select * from public.mlbb_start_code_attempt($1, 1, 1, null)`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("verification attempts", () => {
  it("limits code requests per game account across all users", async () => {
    const users = await Promise.all([1, 2, 3, 4].map((n) => createUser(db, `u${n}@example.com`)));
    const results = [];
    for (const u of users) results.push(await startAttempt(u, 999, 1));
    expect(results.slice(0, 3).every((r) => r.out_attempt_id && !r.out_error)).toBe(true);
    expect(results[3]).toEqual({ out_attempt_id: null, out_error: "rate_limited" });
  });

  it("limits code requests per user", async () => {
    const id = await createUser(db, "spam@example.com");
    for (let i = 0; i < 5; i++) expect((await startAttempt(id, 1000 + i, 1)).out_error).toBeNull();
    expect((await startAttempt(id, 2000, 1)).out_error).toBe("rate_limited");
  });

  it("closes an attempt after too many code submissions", async () => {
    const id = await createUser(db, "guess@example.com");
    const { out_attempt_id } = await startAttempt(id);
    const statuses: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { rows } = await db.query<{ out_status: string }>(
        `select * from public.mlbb_begin_code_submission($1, $2)`,
        [out_attempt_id, id],
      );
      statuses.push(rows[0].out_status);
    }
    expect(statuses).toEqual(["ok", "ok", "ok", "ok", "ok", "too_many"]);
  });

  it("rejects submissions for another user's attempt and expired attempts", async () => {
    const a = await createUser(db, "a@example.com");
    const b = await createUser(db, "b@example.com");
    const { out_attempt_id } = await startAttempt(a);
    const other = await db.query<{ out_status: string }>(
      `select * from public.mlbb_begin_code_submission($1, $2)`,
      [out_attempt_id, b],
    );
    expect(other.rows[0].out_status).toBe("not_found");

    await db.query(`update public.mlbb_verification_attempts set expires_at = now() - interval '1 second'`);
    const expired = await db.query<{ out_status: string }>(
      `select * from public.mlbb_begin_code_submission($1, $2)`,
      [out_attempt_id, a],
    );
    expect(expired.rows[0].out_status).toBe("expired");
  });

  it("finalizes into account, encrypted session, first snapshot, and audit trail", async () => {
    const id = await createUser(db, "player@example.com");
    const { out_account_id, out_transferred_from } = await verifyAccount(id);
    expect(out_transferred_from).toBeNull();

    const account = await db.query(`select * from public.mlbb_accounts where id = $1`, [out_account_id]);
    expect(account.rows[0]).toMatchObject({ role_id: 111, zone_id: 2222, status: "active", current_rank_level: 120 });
    const session = await db.query(`select encrypted_token from public.mlbb_provider_sessions`);
    expect(session.rows).toEqual([{ encrypted_token: "v1:enc" }]);
    const snaps = await db.query(`select rank_level, source from public.rank_snapshots`);
    expect(snaps.rows).toEqual([{ rank_level: 120, source: "provider" }]);
    const audit = await db.query<{ action: string }>(`select action from public.audit_logs order by id`);
    expect(audit.rows.map((r) => r.action)).toEqual(["mlbb.verify.code_requested", "mlbb.verify.success"]);
  });

  it("cannot finalize the same attempt twice", async () => {
    const id = await createUser(db, "twice@example.com");
    const attempt = await startAttempt(id);
    await finalize(attempt.out_attempt_id!, id);
    await expect(finalize(attempt.out_attempt_id!, id)).rejects.toThrow(/attempt_not_open/);
  });

  it("moves a game account to whoever proves ownership most recently", async () => {
    const oldOwner = await createUser(db, "old@example.com");
    const newOwner = await createUser(db, "new@example.com");
    await verifyAccount(oldOwner, 555, 9);
    const { out_transferred_from } = await verifyAccount(newOwner, 555, 9);
    expect(out_transferred_from).toBe(oldOwner);
    const { rows } = await db.query<{ profile_id: string }>(
      `select profile_id from public.mlbb_accounts where role_id = 555`,
    );
    expect(rows).toEqual([{ profile_id: newOwner }]);
  });

  it("does not let a manual approval take an account verified by code", async () => {
    const owner = await createUser(db, "owner@example.com");
    const claimant = await createUser(db, "claimant@example.com");
    const admin = await createUser(db, "admin@example.com");
    await verifyAccount(owner, 777, 1);
    const { rows } = await db.query<{ out_attempt_id: string }>(
      `select * from public.mlbb_submit_manual_request($1, 777, 1, 'please', null)`,
      [claimant],
    );
    const result = await db.query<{ mlbb_review_manual_request: string }>(
      `select public.mlbb_review_manual_request($1, $2, true, 'ok')`,
      [rows[0].out_attempt_id, admin],
    );
    expect(result.rows[0].mlbb_review_manual_request).toBe("already_linked");
  });
});

describe("visibility and leaderboard", () => {
  it("shows accounts and snapshots to others only after opt-in", async () => {
    const owner = await createUser(db, "owner@example.com");
    const viewer = await createUser(db, "viewer@example.com");
    await verifyAccount(owner);

    const countAs = (role: "anon" | "authenticated", uid: string | null, sql: string) =>
      as(db, role, uid, async () => (await db.query(sql)).rows.length);

    expect(await countAs("authenticated", owner, `select * from public.mlbb_accounts`)).toBe(1);
    expect(await countAs("authenticated", viewer, `select * from public.mlbb_accounts`)).toBe(0);
    expect(await countAs("anon", null, `select * from public.rank_snapshots`)).toBe(0);
    expect(await countAs("anon", null, `select * from public.leaderboard_entries`)).toBe(0);

    await db.query(`update public.profiles set leaderboard_opt_in = true where id = $1`, [owner]);

    expect(await countAs("authenticated", viewer, `select * from public.mlbb_accounts`)).toBe(1);
    expect(await countAs("anon", null, `select * from public.rank_snapshots`)).toBe(1);
    expect(await countAs("anon", null, `select * from public.leaderboard_entries`)).toBe(1);
  });

  it("keeps mock and manual accounts off the leaderboard", async () => {
    const id = await createUser(db, "mock@example.com");
    await verifyAccount(id);
    await db.query(`update public.profiles set leaderboard_opt_in = true`);
    await db.query(`update public.mlbb_accounts set data_source = 'mock'`);
    expect((await db.query(`select * from public.leaderboard_entries`)).rows).toHaveLength(0);
  });

  it("keeps global positions when the leaderboard is filtered", async () => {
    const top = await createUser(db, "top@example.com");
    const second = await createUser(db, "second@example.com");
    await verifyAccount(top, 1, 1, 200);
    await verifyAccount(second, 2, 1, 120);
    await db.query(`update public.profiles set leaderboard_opt_in = true`);
    const { rows } = await as(db, "anon", null, () =>
      db.query<{ position: string }>(`select position from public.leaderboard_entries where rank_level between 106 and 135`),
    );
    expect(rows.map((r) => Number(r.position))).toEqual([2]);
  });

  it("computes weekly change from a snapshot 7–14 days old", async () => {
    const id = await createUser(db, "climber@example.com");
    const { out_account_id } = await verifyAccount(id, 1, 1, 140);
    await db.query(`update public.profiles set leaderboard_opt_in = true`);
    await db.query(
      `insert into public.rank_snapshots (account_id, rank_level, source, captured_at)
       values ($1, 130, 'provider', now() - interval '8 days')`,
      [out_account_id],
    );
    const { rows } = await db.query<{ weekly_change: number }>(`select weekly_change from public.leaderboard_entries`);
    expect(rows[0].weekly_change).toBe(10);
  });
});

describe("rank sync", () => {
  it("allows only one running job per kind and recovers stale locks", async () => {
    const first = await db.query<{ claim_sync_job: string | null }>(`select public.claim_sync_job('rank_sync', 'cron')`);
    const second = await db.query<{ claim_sync_job: string | null }>(`select public.claim_sync_job('rank_sync', 'cron')`);
    expect(first.rows[0].claim_sync_job).toBeTruthy();
    expect(second.rows[0].claim_sync_job).toBeNull();

    await db.query(`update public.sync_jobs set heartbeat_at = now() - interval '1 hour'`);
    const third = await db.query<{ claim_sync_job: string | null }>(`select public.claim_sync_job('rank_sync', 'cron')`);
    expect(third.rows[0].claim_sync_job).toBeTruthy();
  });

  it("writes a snapshot only when the rank changed or the last one is a day old", async () => {
    const id = await createUser(db, "sync@example.com");
    const { out_account_id } = await verifyAccount(id, 1, 1, 120);
    const record = async (level: number) =>
      (
        await db.query<{ mlbb_record_sync_success: boolean }>(
          `select public.mlbb_record_sync_success($1, null, null, null, null, null, $2, null, 'provider', now() + interval '12 hours')`,
          [out_account_id, level],
        )
      ).rows[0].mlbb_record_sync_success;

    expect(await record(120)).toBe(false);
    expect(await record(121)).toBe(true);
    await db.query(`update public.rank_snapshots set captured_at = now() - interval '25 hours'`);
    expect(await record(121)).toBe(true);
  });

  it("backs off on errors and requires re-verification on unauthorized", async () => {
    const id = await createUser(db, "fail@example.com");
    const { out_account_id } = await verifyAccount(id);

    await db.query(`select public.mlbb_record_sync_failure($1, null, 'unavailable', 'timeout')`, [out_account_id]);
    await db.query(`select public.mlbb_record_sync_failure($1, null, 'unavailable', 'timeout')`, [out_account_id]);
    const backoff = await db.query<{ hours: number; consecutive_failures: number }>(
      `select round(extract(epoch from next_sync_at - now()) / 3600)::int as hours, consecutive_failures
         from public.mlbb_accounts where id = $1`,
      [out_account_id],
    );
    expect(backoff.rows[0]).toEqual({ hours: 2, consecutive_failures: 2 });

    await db.query(`select public.mlbb_record_sync_failure($1, null, 'unauthorized', '401')`, [out_account_id]);
    const account = await db.query(`select status, next_sync_at from public.mlbb_accounts where id = $1`, [out_account_id]);
    expect(account.rows[0]).toEqual({ status: "reauth_required", next_sync_at: null });
    const due = await db.query(`select * from public.mlbb_due_sync_accounts(10)`);
    expect(due.rows).toHaveLength(0);
  });
});

describe("articles", () => {
  it("shows only published articles to the public, and only admins can write", async () => {
    const admin = await createUser(db, "admin@example.com");
    const user = await createUser(db, "user@example.com");
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [admin]);

    await as(db, "authenticated", admin, () =>
      db.query(
        `insert into public.articles (slug, title, category_id, status, published_at) values
           ('draft-post', 'Draft post', 1, 'draft', null),
           ('live-post', 'Live post', 1, 'published', now() - interval '1 minute')`,
      ),
    );
    await expect(
      as(db, "authenticated", user, () =>
        db.query(`insert into public.articles (slug, title, category_id) values ('nope', 'Nope', 1)`),
      ),
    ).rejects.toThrow(/row-level security/);

    const visible = await as(db, "anon", null, () => db.query<{ slug: string }>(`select slug from public.articles`));
    expect(visible.rows.map((r) => r.slug)).toEqual(["live-post"]);
  });
});
