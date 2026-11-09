import type { z } from "zod";
import { ProviderError } from "../provider";
import { errorBodySchema } from "./schemas";

export interface RoneArenaClientOptions {
  baseUrl: string;
  /** Hosts the client may fail over to when the API names an `alternative_endpoint`. */
  allowedHosts: string[];
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions<T extends z.ZodType> {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  token?: string;
  schema: T;
  /** Only idempotent requests may be retried. Sending a code is never idempotent. */
  retry?: boolean;
  /** Seconds to cache in Next's data cache (public data only). */
  revalidate?: number;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export class RoneArenaClient {
  private baseUrl: string;
  private readonly allowedHosts: Set<string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: RoneArenaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.allowedHosts = new Set(options.allowedHosts.map((h) => h.toLowerCase()));
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async request<T extends z.ZodType>(options: RequestOptions<T>): Promise<z.output<T>> {
    const attempts = options.retry === false ? 1 : this.maxRetries + 1;
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        const backoff = lastError?.retryAfterMs ?? 300 * 2 ** (attempt - 1) + Math.random() * 200;
        await this.sleep(Math.min(backoff, 5_000));
      }
      try {
        return await this.once(options);
      } catch (error) {
        lastError = error instanceof ProviderError ? error : new ProviderError("unknown", String(error), { cause: error });
        if (lastError.kind !== "unavailable") throw lastError;
      }
    }
    throw lastError!;
  }

  private async once<T extends z.ZodType>(options: RequestOptions<T>): Promise<z.output<T>> {
    const url = new URL(`${this.baseUrl}/api${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers.Authorization = `Bearer ${options.token}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
        // Authenticated data must never land in a shared cache.
        ...(options.token || options.method === "POST"
          ? { cache: "no-store" as const }
          : options.revalidate
            ? { next: { revalidate: options.revalidate } }
            : { cache: "no-store" as const }),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new ProviderError("unavailable", timedOut ? "Provider request timed out" : "Provider network error", {
        cause: error,
      });
    }

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.httpError(response, body);
    }

    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError("invalid_response", `Unexpected response shape from ${options.path}`, {
        status: response.status,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  private httpError(response: Response, body: unknown): ProviderError {
    const status = response.status;
    const parsed = errorBodySchema.safeParse(body);
    const message = parsed.success ? `${parsed.data.code}: ${parsed.data.message ?? ""}` : `HTTP ${status}`;

    if (status === 503 && parsed.success && parsed.data.alternative_endpoint) {
      this.switchHost(parsed.data.alternative_endpoint);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;

    if (status === 401 || status === 403) return new ProviderError("unauthorized", message, { status });
    if (status === 422 || status === 400) return new ProviderError("invalid_input", message, { status });
    if (status === 429) return new ProviderError("rate_limited", message, { status, retryAfterMs });
    if (RETRYABLE_STATUS.has(status) || status >= 500) {
      return new ProviderError("unavailable", message, { status, retryAfterMs });
    }
    return new ProviderError("unknown", message, { status });
  }

  /** Follow the API's failover hint, but only to a host we trust. */
  private switchHost(candidate: string) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && this.allowedHosts.has(url.host.toLowerCase())) {
        this.baseUrl = url.origin;
      }
    } catch {
      // Ignore malformed hints.
    }
  }

  get currentBaseUrl() {
    return this.baseUrl;
  }
}
