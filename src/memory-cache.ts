// In-process stand-in for the Cloudflare Workers Cache API, used when the server runs on plain Node.
// Honors `cache-control: max-age=N` and keeps memory bounded.

export interface MemoryCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  readonly size: number;
}

export interface MemoryCacheOptions {
  maxEntries?: number;
  now?: () => number;
}

export const DEFAULT_MAX_CACHE_ENTRIES = 500;

function maxAgeSeconds(response: Response): number | undefined {
  const match = /(?:^|[\s,])max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "");
  return match ? Number(match[1]) : undefined;
}

export function createMemoryCache(options: MemoryCacheOptions = {}): MemoryCache {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES));
  const now = options.now ?? Date.now;
  // Map iterates in insertion order, so the first key is always the oldest entry.
  const entries = new Map<string, { response: Response; expiresAt: number }>();

  function purgeExpired(): void {
    const t = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= t) entries.delete(key);
  }

  return {
    get size() { return entries.size; },
    async match(request) {
      const entry = entries.get(request.url);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { entries.delete(request.url); return undefined; }
      return entry.response.clone();
    },
    async put(request, response) {
      const ttl = maxAgeSeconds(response);
      // Without a positive max-age there is no freshness lifetime, so nothing is stored.
      if (ttl === undefined || ttl <= 0) return;
      entries.delete(request.url);
      purgeExpired();
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
      entries.set(request.url, { response: response.clone(), expiresAt: now() + ttl * 1000 });
    }
  };
}