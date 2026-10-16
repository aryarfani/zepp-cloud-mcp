import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { ICON_PATHS, iconResponse } from "../src/dashboard/icons";
import { FAVICON_SVG } from "../src/dashboard/icons-data";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (b: Uint8Array) => PNG_MAGIC.every((v, i) => b[i] === v);
const dims = (b: Uint8Array) => [new DataView(b.buffer, b.byteOffset).getUint32(16), new DataView(b.buffer, b.byteOffset).getUint32(20)];

describe("icon responses", () => {
  const expected: Record<string, [string, number?]> = {
    "/dashboard/favicon-16.png": ["image/png", 16], "/dashboard/favicon-32.png": ["image/png", 32], "/dashboard/apple-touch-icon.png": ["image/png", 180],
    "/dashboard/icon-192.png": ["image/png", 192], "/dashboard/icon-512.png": ["image/png", 512]
  };
  it("serves the PNGs at the right sizes with caching and nosniff", async () => {
    for (const [path, [type, size]] of Object.entries(expected)) {
      const res = iconResponse(path, "GET")!;
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const b = new Uint8Array(await res.arrayBuffer());
      expect(png(b)).toBe(true);
      expect(dims(b)).toEqual([size, size]);
      expect(Number(res.headers.get("content-length"))).toBe(b.length);
    }
  });
  it("serves an SVG that is a vector Z on a rounded square, and a two-size ICO", async () => {
    const svg = iconResponse("/dashboard/favicon.svg", "GET")!;
    expect(svg.headers.get("content-type")).toContain("image/svg+xml");
    const text = await svg.text();
    expect(text).toBe(FAVICON_SVG);
    expect(text).toContain("<svg"); expect(text).toContain("linearGradient"); expect(text).not.toMatch(/<script|onload|href=/i);
    for (const p of ["/favicon.ico", "/dashboard/favicon.ico"]) {
      const res = iconResponse(p, "GET")!;
      expect(res.headers.get("content-type")).toBe("image/x-icon");
      const b = new Uint8Array(await res.arrayBuffer());
      const dv = new DataView(b.buffer);
      expect([dv.getUint16(0, true), dv.getUint16(2, true), dv.getUint16(4, true)]).toEqual([0, 1, 2]);
      expect([b[6], b[22]]).toEqual([16, 32]);
      const off = dv.getUint32(6 + 12, true), len = dv.getUint32(6 + 8, true);
      expect(png(b.slice(off, off + len))).toBe(true);
    }
  });
  it("answers HEAD without a body, rejects other methods, ignores other paths", async () => {
    const head = iconResponse("/favicon.ico", "HEAD")!;
    expect(head.status).toBe(200); expect(await head.text()).toBe(""); expect(Number(head.headers.get("content-length"))).toBeGreaterThan(100);
    expect(iconResponse("/favicon.ico", "POST")!.status).toBe(405);
    expect(iconResponse("/dashboard/api/overview", "GET")).toBeNull();
    expect(iconResponse("/dashboard/favicon.svg/../x", "GET")).toBeNull();
    expect(ICON_PATHS.sort()).toEqual(["/dashboard/apple-touch-icon.png", "/dashboard/favicon-16.png", "/dashboard/favicon-32.png", "/dashboard/favicon.ico", "/dashboard/favicon.svg", "/dashboard/icon-192.png", "/dashboard/icon-512.png", "/favicon.ico"]);
  });
});

describe("app routing", () => {
  const env = { MCP_SECRET: "s".repeat(32) } as never;
  it("serves /favicon.ico only where the dashboard exists, and leaves /mcp, /health and /dashboard alone", async () => {
    const withDash = createApp({ env, oauth: null, dashboard: async () => new Response("dash") });
    const ico = await withDash(new Request("https://x.test/favicon.ico"));
    expect(ico.status).toBe(200); expect(ico.headers.get("content-type")).toBe("image/x-icon");
    expect(await (await withDash(new Request("https://x.test/dashboard/anything"))).text()).toBe("dash");
    expect((await withDash(new Request("https://x.test/health"))).status).toBe(200);
    expect((await withDash(new Request("https://x.test/mcp", { method: "POST" }))).status).toBe(401);
    expect((await withDash(new Request("https://x.test/favicon.png"))).status).toBe(404);
    const without = createApp({ env, oauth: null });
    expect((await without(new Request("https://x.test/favicon.ico"))).status).toBe(404);
  });
});
