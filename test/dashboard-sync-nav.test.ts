import { describe, expect, it } from "vitest";
import { DASHBOARD_JS, renderDashboardHtml } from "../src/dashboard/ui";

// Static checks of the sidebar sync animation (behaviour is covered in the node/jsdom tests).
describe("sidebar sync animation (static)", () => {
  const html = renderDashboardHtml("abc", "tok");

  it("polls only /dashboard/api/status, quickly while running and slowly otherwise", () => {
    expect(DASHBOARD_JS).toMatch(/WATCH_BUSY_MS = 3000/);
    expect(DASHBOARD_JS).toMatch(/WATCH_IDLE_MS = 45000/);
    expect(DASHBOARD_JS).toContain('api("status")');
    expect(DASHBOARD_JS).not.toMatch(/setInterval/); // one re-armed timer, never overlapping intervals
    expect(DASHBOARD_JS).toContain("document.hidden"); // no idle polling in a background tab
  });

  it("styles the Sync item: spinning icon, soft pulsing teal glow, icon-only when collapsed, static glow for reduced motion", () => {
    expect(html).toContain("nav.menu a.syncing svg{color:var(--teal);animation:navspin 1.1s linear infinite}");
    expect(html).toContain("nav.menu a.syncing{animation:navglow 2.2s ease-in-out infinite}");
    expect(html).toContain(".app.collapsed nav.menu a.syncing{animation:none}");
    expect(html).toMatch(/@media \(prefers-reduced-motion:reduce\)\{nav\.menu a\.syncing,\.app\.collapsed nav\.menu a\.syncing\{animation:none;box-shadow:/);
  });

  it("adds no badge or step count to the nav and keeps the CSP-relevant rules (no inline style/handlers)", () => {
    expect(html).not.toMatch(/\sstyle=|\son[a-z]+=/i);
    expect(DASHBOARD_JS).not.toMatch(/innerHTML/);
    const sync = /<a href="#\/sync"[^>]*>(.*?)<\/a>/.exec(html)![1]!;
    expect(sync.replace(/<svg.*?<\/svg>/, "")).toBe("<span>Sync</span>");
  });
});
