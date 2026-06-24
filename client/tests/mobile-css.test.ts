import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

function blockFor(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) {
    return "";
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("mobile touch targets", () => {
  it("keeps global language controls at least 44px tall", () => {
    expect(blockFor(".language-select")).toContain("min-height: 44px");
    expect(blockFor(".language-select select")).toContain("min-height: 44px");
  });

  it("keeps production dialog icon and compact actions at least 44px", () => {
    expect(blockFor(".icon-button")).toContain("width: 44px");
    expect(blockFor(".icon-button")).toContain("height: 44px");
    expect(blockFor(".compact-action")).toContain("min-height: 44px");
    expect(blockFor(".custom-size-grid input")).toContain("min-height: 44px");
  });

  it("keeps selected photo removal controls at least 44px", () => {
    expect(blockFor(".selected-photo-remove")).toContain("min-height: 44px");
  });

  it("tightens the question step on short phones so all choices are easier to discover", () => {
    expect(css).toContain("@media (max-height: 640px) and (max-width: 520px)");
    expect(css).toContain("aspect-ratio: 3 / 1");
    expect(css).toContain("min-height: 56px");
  });
});
