import { afterEach, describe, expect, it, vi } from "vitest";
import { withZeppCache } from "../src/cache";
import { createMemoryCache } from "../src/memory-cache";

const req = (name: string) => new Request(`https://cache.zepp-mcp.invalid/${name}`);
const res = (body: unknown, maxAge?: number) =>
  Response.json(body, maxAge === undefined ? {} : { headers: { "cache-control": `max-age=${maxAge}` } });

describe("in-memory cache (Node stand-in for the Workers Cache API)", () => {
  it("returns a stored entry until its max-age elapses, then drops it", async () => {
    let now = 1_000_000;
    const cache = createMemoryCache({ now: () => now });
    await cache.put(req("a"), res({ v: 1 }, 10));
    expect(await (await cache.match(req("a")))?.json()).toEqual({ v: 1 });
    now += 9_999;
    expect(await cache.match(req("a"))).toBeDefined();
    now += 2;
    expect(await cache.match(req("a"))).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("does not store responses without a positive max-age", async () => {
    const cache = createMemoryCache();
    await cache.put(req("none"), res({ v: 1 }));
    await cache.put(req("zero"), res({ v: 1 }, 0));
    expect(cache.size).toBe(0);
  });

  it("caps the number of entries and evicts the oldest first", async () => {
    const cache = createMemoryCache({ maxEntries: 3 });
    for (const name of ["a", "b", "c", "d"]) await cache.put(req(name), res({ name }, 60));
    expect(cache.size).toBe(3);
    expect(await cache.match(req("a"))).toBeUndefined();
    for (const name of ["b", "c", "d"]) expect(await cache.match(req(name))).toBeDefined();
  });

  it("evicts expired entries before live ones when full", async () => {
    let now = 0;
    const cache = createMemoryCache({ maxEntries: 2, now: () => now });
    await cache.put(req("short"), res({}, 1));
    await cache.put(req("long"), res({}, 100));
    now += 5_000;
    await cache.put(req("new"), res({}, 100));
    expect(cache.size).toBe(2);
    expect(await cache.match(req("long"))).toBeDefined();
    expect(await cache.match(req("new"))).toBeDefined();
  });

  it("defaults to a 500 entry cap", async () => {
    const cache = createMemoryCache();
    for (let i = 0; i < 520; i++) await cache.put(req(`k${i}`), res({ i }, 60));
    expect(cache.size).toBe(500);
  });

  it("overwriting a key refreshes it instead of growing the cache", async () => {
    const cache = createMemoryCache({ maxEntries: 2 });
    await cache.put(req("a"), res({ v: 1 }, 60));
    await cache.put(req("a"), res({ v: 2 }, 60));
    expect(cache.size).toBe(1);
    expect(await (await cache.match(req("a")))?.json()).toEqual({ v: 2 });
  });
});

describe("withZeppCache on the in-memory cache", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("serves the second call from cache and honors the TTL", async () => {
    let now = 0;
    vi.stubGlobal("caches", { default: createMemoryCache({ now: () => now }) });
    const loader = vi.fn(async () => ({ n: loader.mock.calls.length }));
    expect(await withZeppCache("ns", { a: 1 }, 30, loader)).toEqual({ n: 1 });
    expect(await withZeppCache("ns", { a: 1 }, 30, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    now += 31_000;
    expect(await withZeppCache("ns", { a: 1 }, 30, loader)).toEqual({ n: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("runs a failing loader exactly once and does not cache the failure", async () => {
    vi.stubGlobal("caches", { default: createMemoryCache() });
    const loader = vi.fn(async () => { throw new Error("boom"); });
    await expect(withZeppCache("ns", { a: 1 }, 30, loader)).rejects.toThrow("boom");
    expect(loader).toHaveBeenCalledTimes(1);
    const ok = vi.fn(async () => "fine");
    expect(await withZeppCache("ns", { a: 1 }, 30, ok)).toBe("fine");
  });

  it("bypasses the cache when the TTL is not positive", async () => {
    const cache = createMemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const loader = vi.fn(async () => 1);
    await withZeppCache("ns", {}, 0, loader);
    await withZeppCache("ns", {}, 0, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it("still returns the value when the cache itself throws", async () => {
    vi.stubGlobal("caches", { default: { match: async () => { throw new Error("cache down"); }, put: async () => { throw new Error("cache down"); } } });
    const loader = vi.fn(async () => "value");
    expect(await withZeppCache("ns", {}, 30, loader)).toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });
});