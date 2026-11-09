import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal stand-in for `supabase.rpc()` backed by PGlite. Uses named arguments
 * exactly like PostgREST, so a misspelled parameter fails here too. Set-returning
 * functions yield row arrays and scalar functions yield the bare value, as PostgREST does.
 */
export function pgliteRpcClient(db: PGlite): SupabaseClient {
  return {
    async rpc(fn: string, params: Record<string, unknown> = {}) {
      try {
        const { rows: meta } = await db.query<{ proretset: boolean }>(
          `select proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = $1`,
          [fn],
        );
        if (meta.length === 0) throw new Error(`function public.${fn} does not exist`);
        const keys = Object.keys(params);
        const args = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
        const values = keys.map((k) => {
          const v = params[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        const res = await db.query<Record<string, unknown>>(`select * from public.${fn}(${args})`, values);
        if (meta[0].proretset) return { data: res.rows, error: null };
        const row = res.rows[0];
        return { data: row ? Object.values(row)[0] : null, error: null };
      } catch (error) {
        return { data: null, error: { message: (error as Error).message } };
      }
    },
  } as unknown as SupabaseClient;
}
