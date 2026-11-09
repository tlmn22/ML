import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/security/request";
import { createClient } from "@/lib/supabase/server";

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Guard for mutating JSON routes called from our own pages:
 * same-origin, JSON body matching `schema`, and a signed-in user.
 */
export async function guardJsonRoute<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; userId: string; body: z.output<T> } | { ok: false; response: NextResponse }> {
  if (!isSameOrigin(request, getServerEnv().NEXT_PUBLIC_SITE_URL)) {
    return { ok: false, response: jsonError("forbidden", 403) };
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, response: jsonError("bad_request", 415) };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { ok: false, response: jsonError("unauthorized", 401) };

  const raw = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: jsonError("bad_request", 400) };

  return { ok: true, userId, body: parsed.data };
}
