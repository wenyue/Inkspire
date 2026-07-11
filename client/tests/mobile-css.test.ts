import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

function blockFor(selector: string, startAt = 0): string {
  const start = css.indexOf(selector, startAt);
  expect(start, `Missing CSS selector ${selector}`).not.toBe(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function expectNoRuleForClass(className: string): void {
  expect(cssWithoutComments).not.toMatch(new RegExp(`\\.${className}(?![-_a-zA-Z0-9])[^{}]*\\{`));
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

  it("keeps action surfaces in desktop flow and makes them sticky only on mobile", () => {
    const baseActionSurface = blockFor(".mobile-action-surface {");
    const mobileMediaStart = css.indexOf("@media (max-width: 520px)");
    const nextMediaStart = css.indexOf("@media", mobileMediaStart + 1);
    const mobileActionStart = css.indexOf(".mobile-action-surface {", mobileMediaStart);

    expect(baseActionSurface).not.toMatch(/position:\s*sticky/);
    expect(baseActionSurface).not.toMatch(/bottom:\s*0/);
    expect(baseActionSurface).not.toMatch(/z-index:/);
    expect(baseActionSurface).not.toMatch(/linear-gradient|safe-area-inset-bottom/);
    expect(mobileMediaStart).not.toBe(-1);
    expect(mobileActionStart).toBeGreaterThan(mobileMediaStart);
    expect(mobileActionStart).toBeLessThan(nextMediaStart);

    const mobileActionSurface = blockFor(".mobile-action-surface {", mobileMediaStart);
    expect(mobileActionSurface).toContain("position: sticky");
    expect(mobileActionSurface).toContain("bottom: 0");
    expect(mobileActionSurface).toMatch(/z-index:\s*[1-9]/);
    expect(mobileActionSurface).toMatch(/padding:[^;]*safe-area-inset-bottom/);
    expect(mobileActionSurface).toMatch(/linear-gradient\([^;]*rgba\(255, 250, 240, 0\)[^;]*#fffaf0/);
  });

  it("gives only notes controls mobile scroll clearance for the sticky action", () => {
    const mobileMediaStart = css.indexOf("@media (max-width: 520px)");
    const mobileNotesClearance = blockFor(
      ".notes-suggestion-row button,\n  .conversation-note-shell textarea",
      mobileMediaStart
    );

    expect(css.slice(0, mobileMediaStart)).not.toContain(".notes-suggestion-row");
    expect(mobileNotesClearance).toMatch(/scroll-margin-block-end:\s*calc\([^;]*safe-area-inset-bottom/);
    expect(mobileNotesClearance).not.toMatch(/padding-bottom|margin-bottom/);
  });

  it("uses a fixed-header scroll-body safe-area-footer production dialog", () => {
    const dialog = blockFor(".production-dialog {");
    const body = blockFor(".production-dialog-body");
    const footer = blockFor(".production-dialog-footer");

    expect(dialog).toContain("display: grid");
    expect(dialog).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(dialog).toContain("overflow: hidden");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("overflow-y: auto");
    expect(footer).toMatch(/padding-bottom:\s*calc\([^;]*safe-area-inset-bottom/);
  });

  it("keeps selected photo removal controls at least 44px", () => {
    expect(blockFor(".selected-photo-remove")).toContain("min-height: 44px");
  });

  it("lets photo inputs own the full tap target instead of a hidden one-pixel proxy", () => {
    const photoInputBlock = blockFor(".photo-strip input,\n.photo-step-actions input");

    expect(photoInputBlock).toContain("inset: 0");
    expect(photoInputBlock).toContain("width: 100%");
    expect(photoInputBlock).toContain("height: 100%");
  });

  it("tightens the question step on short phones so all choices are easier to discover", () => {
    expect(css).toContain("@media (max-height: 640px) and (max-width: 520px)");
    expect(css).toContain("aspect-ratio: 3 / 1");
    expect(css).toContain("min-height: 56px");
  });

  it("gives the studio notes textarea a larger default height", () => {
    expect(blockFor(".conversation-panel textarea")).toContain("min-height: 140px");
  });

  it("keeps the studio notes textarea at a fixed size by default", () => {
    expect(blockFor(".conversation-panel textarea")).toContain("resize: none");
  });

  it("anchors a translucent clear button at the bottom-right of the notes field", () => {
    expect(blockFor(".conversation-note-shell")).toContain("position: relative");
    expect(blockFor(".conversation-panel textarea")).toMatch(/padding:[^;]*56px/);
    expect(blockFor(".conversation-note-clear")).toContain("position: absolute");
    expect(blockFor(".conversation-note-clear")).toContain("right: 4px");
    expect(blockFor(".conversation-note-clear")).toContain("bottom: 4px");
    expect(blockFor(".conversation-note-clear")).toContain("width: 44px");
    expect(blockFor(".conversation-note-clear")).toContain("height: 44px");
    expect(blockFor(".conversation-note-clear")).toContain("background: rgba(255, 255, 255, 0.62)");
  });

  it("shows copy toasts fixed at the bottom center of the screen", () => {
    expect(blockFor(".copy-toast")).toContain("position: fixed");
    expect(blockFor(".copy-toast")).toContain("left: 50%");
    expect(blockFor(".copy-toast")).toContain("transform: translateX(-50%)");
    expect(blockFor(".copy-toast")).toContain("bottom: 24px");
    expect(blockFor(".copy-toast")).toContain("pointer-events: none");
  });

  it("shows complete result artwork and preview images without cropping", () => {
    expect(blockFor(".result-grid img,\n.image-placeholder")).toContain("object-fit: contain");
  });

  it("keeps compact result actions in one touch-friendly column", () => {
    const compactResultRules = css.slice(css.indexOf("@media (max-width: 420px)"));

    expect(compactResultRules).toMatch(/\.result-actions\s*{[^}]*grid-template-columns:\s*1fr/s);
    expect(blockFor(".result-action-button,\n.result-upload-action")).toContain("min-height: 44px");
  });

  it("keeps image loading surfaces empty instead of patterned placeholders", () => {
    expect(blockFor(".preview-ink")).not.toMatch(/background:/);
    expect(blockFor(".preview-hero-image")).not.toMatch(/background:/);
    expect(blockFor(".option-preview-frame")).not.toMatch(/background:/);
    expect(blockFor(".expert-sample-frame")).not.toMatch(/background:/);
    expect(blockFor(".result-grid img,\n.image-placeholder")).not.toMatch(/background:/);
  });

  it("does not keep stitched montage styles for question previews", () => {
    expectNoRuleForClass("preview-montage");
    expectNoRuleForClass("montage-cell");
    expectNoRuleForClass("montage-tile");
  });

  it("keeps library titles to one line with ellipsis", () => {
    const titleBlock = blockFor(".library-copy strong");

    expect(titleBlock).toContain("min-width: 0");
    expect(titleBlock).toContain("overflow: hidden");
    expect(titleBlock).toContain("text-overflow: ellipsis");
    expect(titleBlock).toContain("white-space: nowrap");
  });
});
