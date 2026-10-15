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
});