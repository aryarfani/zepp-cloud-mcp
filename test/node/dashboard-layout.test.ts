import { describe, expect, it } from "vitest";
import { DASHBOARD_JS, renderDashboardHtml } from "../../src/dashboard/ui";

describe("dashboard layout is full width", () => {
  const html = renderDashboardHtml("n0nce");
  const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

  it("does not cap the main content width", () => {
    const view = /#view\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(view).toContain("width:100%");
    expect(view).not.toMatch(/max-width:\s*\d/);
    expect(css).not.toMatch(/max-width:\s*1[0-9]{3}px/);
  });

  it("uses auto-fit grids that add columns on wide screens", () => {
    expect(css).toMatch(/\.cards\{[^}]*repeat\(auto-fit,minmax\(/);
    expect(css).toMatch(/\.grid2\{[^}]*repeat\(auto-fit,minmax\(/);
    expect(css).toMatch(/@media \(max-width:820px\)/); // mobile layout kept
    expect(css).toMatch(/\.grid2\{grid-template-columns:1fr\}/);
  });

  it("charts take their viewBox from the container width and redraw on resize", () => {
    expect(DASHBOARD_JS).toContain("function draw(W)");
    expect(DASHBOARD_JS).toContain("wrap.clientWidth");
    expect(DASHBOARD_JS).toContain("ResizeObserver");
    expect(DASHBOARD_JS).toContain('addEventListener("resize"');
    expect(DASHBOARD_JS).toContain('viewBox: "0 0 " + W + " " + H');
    expect(css).toMatch(/svg\.chart\{width:100%;height:auto/);
  });

  it("workouts view is a fixed-height split whose list and detail scroll on their own", () => {
    expect(css).toMatch(/\.content\.fit\{[^}]*height:100vh[^}]*overflow:hidden/);
    expect(css).toMatch(/\.content\.fit #view\{[^}]*min-height:0[^}]*overflow:hidden/);
    expect(css).toMatch(/\.content\.fit \.split\{[^}]*min-height:0/);
    expect(css).toMatch(/\.wlist\{[^}]*min-height:0[^}]*overflow-y:auto/);
    expect(css).toMatch(/\.wdetail\{[^}]*min-height:0[^}]*overflow-y:auto/);
    expect(css).not.toMatch(/\.wlist\{[^}]*max-height/);
    expect(html).toContain('id="content"');
    expect(DASHBOARD_JS).toContain("new IntersectionObserver");
    expect(DASHBOARD_JS).toContain("live.select(r.rest)");
  });});