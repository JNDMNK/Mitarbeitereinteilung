import "server-only";

/**
 * Einfaches In-Memory-Rate-Limit (Sliding Window). Reicht für einen einzelnen
 * Container; bei mehreren Instanzen müsste es in die DB/Redis wandern.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Zählt einen Versuch. Liefert false, wenn das Limit überschritten ist. */
  hit(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return { ok: false, retryAfterMs: list[0] + this.windowMs - now };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return { ok: true, retryAfterMs: 0 };
  }

  /** Prüft, ohne zu zählen */
  check(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (list.length >= this.limit) return { ok: false, retryAfterMs: list[0] + this.windowMs - now };
    return { ok: true, retryAfterMs: 0 };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(now: number) {
    const from = now - this.windowMs;
    for (const [k, list] of this.hits) {
      if (!list.some((t) => t > from)) this.hits.delete(k);
    }
  }
}
