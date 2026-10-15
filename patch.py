import pathlib
p = pathlib.Path('/home/ubuntu/zepp-cloud-mcp/src/cache.ts')
t = p.read_text()
target = '  const cache = (caches as CacheStorage & { default: Cache }).default;'
replacement = '''  const cachesAny = (globalThis as any).caches as (CacheStorage & { default: Cache }) | undefined;
  if (!cachesAny?.default) return loader();
  const cache = cachesAny.default;'''
if target in t:
    # replace the 3 lines with fallback
    new_t = t.replace(target + '\n  const key = new Request(await makeCacheKey(namespace, params), { method: " GET\ });\n const hit = await cache.match(key);\n if (hit) return (await hit.json()) as T;\n const value = await loader();\n await cache.put(key, Response.json(value, { headers: { \cache-control\: max-age= } }));\n return value;', replacement + '\n try {\n const key = new Request(await makeCacheKey(namespace, params), { method: \GET\ });\n const hit = await cache.match(key);\n if (hit) return (await hit.json()) as T;\n const value = await loader();\n await cache.put(key, Response.json(value, { headers: { \cache-control\: max-age= } }));\n return value;\n } catch {\n return loader();\n }')
 p.write_text(new_t)
 print('patched2')
else:
 print('notfound2')
 print(repr(t[500:900]))
