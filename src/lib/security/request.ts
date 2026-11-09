import "server-only";

/** Client IP as reported by Vercel's edge (first hop of x-forwarded-for). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return headers.get("x-real-ip");
}

/**
 * CSRF defense for JSON route handlers: browsers always send Origin on
 * cross-site POSTs, so reject any request whose Origin isn't our own site.
 */
export function isSameOrigin(request: Request, siteUrl: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([new URL(siteUrl).origin, new URL(request.url).origin]);
  return allowed.has(origin);
}
