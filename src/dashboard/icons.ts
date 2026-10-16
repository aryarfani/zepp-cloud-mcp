// Public icon routes (no session): only the app icon, nothing else is served without auth.
import { FAVICON_ICO_B64, FAVICON_SVG, ICON_PNG_B64 } from "./icons-data";

interface Icon { type: string; body: Uint8Array | string }
const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)); // atob: works on Node and workerd

const ICONS: Record<string, Icon> = {
  "/favicon.ico": { type: "image/x-icon", body: bytes(FAVICON_ICO_B64) },
  "/dashboard/favicon.ico": { type: "image/x-icon", body: bytes(FAVICON_ICO_B64) },
  "/dashboard/favicon.svg": { type: "image/svg+xml; charset=utf-8", body: FAVICON_SVG },
  "/dashboard/favicon-16.png": { type: "image/png", body: bytes(ICON_PNG_B64["favicon-16.png"]!) },
  "/dashboard/favicon-32.png": { type: "image/png", body: bytes(ICON_PNG_B64["favicon-32.png"]!) },
  "/dashboard/apple-touch-icon.png": { type: "image/png", body: bytes(ICON_PNG_B64["apple-touch-icon.png"]!) },
  "/dashboard/icon-192.png": { type: "image/png", body: bytes(ICON_PNG_B64["icon-192.png"]!) },
  "/dashboard/icon-512.png": { type: "image/png", body: bytes(ICON_PNG_B64["icon-512.png"]!) }
};

export const ICON_PATHS = Object.keys(ICONS);

/** A response for an icon path (GET or HEAD), or null when the request is not an icon request. */
export function iconResponse(pathname: string, method: string): Response | null {
  const icon = ICONS[pathname];
  if (!icon) return null;
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD", "content-type": "text/plain" } });
  }
  const length = typeof icon.body === "string" ? new TextEncoder().encode(icon.body).length : icon.body.length;
  return new Response(method === "HEAD" ? null : (icon.body as BodyInit), {
    status: 200,
    headers: {
      "content-type": icon.type,
      "content-length": String(length),
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff"
    }
  });
}
