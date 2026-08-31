function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

export async function makeCacheKey(namespace: string, params: unknown): Promise<string> {
  const payload = new TextEncoder().encode(`${namespace}\n${stableStringify(params)}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  const hex = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
  return `https://cache.zepp-mcp.invalid/${encodeURIComponent(namespace)}/${hex}`;
}

export async function withZeppCache<T>(
  namespace: string,
  params: unknown,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const key = new Request(await makeCacheKey(namespace, params), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as T;
  const value = await loader();
  await cache.put(key, Response.json(value, { headers: { "cache-control": `max-age=${ttlSeconds}` } }));
  return value;
}
