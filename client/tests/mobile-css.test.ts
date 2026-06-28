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
    expect(blockFor(".conversation-note-clear")).toContain("position: absolute");
    expect(blockFor(".conversation-note-clear")).toContain("right: 10px");
    expect(blockFor(".conversation-note-clear")).toContain("bottom: 10px");
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

  it("keeps library titles to one line with ellipsis", () => {
    const titleBlock = blockFor(".library-copy strong");

    expect(titleBlock).toContain("min-width: 0");
    expect(titleBlock).toContain("overflow: hidden");
    expect(titleBlock).toContain("text-overflow: ellipsis");
    expect(titleBlock).toContain("white-space: nowrap");
  });
});
