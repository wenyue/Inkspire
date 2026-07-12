import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");
const adjustViewSource = readFileSync(resolve(__dirname, "../src/components/AdjustView.tsx"), "utf8");
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
  it("shows popular templates as two-column large image cards", () => {
    expect(blockFor(".template-grid {")).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(blockFor(".template-preview-image {")).toContain("aspect-ratio: 4 / 3");
    expect(blockFor(".template-preview-image {")).toContain("object-fit: cover");
    expect(blockFor(".template-grid button {")).toContain("overflow: hidden");
  });

  it("hides the main scrollbar without disabling scrolling", () => {
    expect(blockFor(".main-surface {")).toContain("scrollbar-width: none");
    expect(blockFor(".main-surface {")).toContain("overflow-y: auto");
    expect(css).toMatch(/\.main-surface::\-webkit-scrollbar\s*{[^}]*display:\s*none/s);

    const artworkStrip = blockFor(".expert-sample-strip");
    expect(artworkStrip).toContain("scrollbar-width: thin");
    expect(css).toMatch(/\.expert-sample-strip::\-webkit-scrollbar\s*{[^}]*height:\s*5px/s);
  });

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

  it("keeps result actions out of the sticky mobile action surface", () => {
    expect(cssWithoutComments).not.toMatch(/\.result-actions\.mobile-action-surface[^{}]*\{/);
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

  it("uses a fixed-header scroll-body safe-area-footer shared dialog", () => {
    const dialog = blockFor(".shared-dialog {");
    const body = blockFor(".shared-dialog-body");
    const footer = blockFor(".production-dialog-footer");

    expect(dialog).toContain("display: grid");
    expect(dialog).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(dialog).toContain("overflow: hidden");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("overflow-y: auto");
    expect(footer).toMatch(/padding-bottom:\s*calc\([^;]*safe-area-inset-bottom/);
  });

  it("lets shared dialogs cover the mobile viewport and hides the bottom tabs", () => {
    const layer = blockFor(".shared-dialog-layer");
    const hiddenTabs = blockFor(".dialog-open .bottom-tabs");

    expect(layer).not.toMatch(/82px/);
    expect(layer).toMatch(/safe-area-inset-bottom/);
    expect(hiddenTabs).toContain("display: none");
  });

  it("lays out reference levels as a centered three plus two grid on phones", () => {
    const mobileMediaStart = css.indexOf("@media (max-width: 520px)");
    const mobileReferenceList = blockFor(".reference-list", mobileMediaStart);
    const mobileReferenceCard = blockFor(".reference-card", mobileMediaStart);

    expect(mobileReferenceList).toContain("grid-template-columns: repeat(6, minmax(0, 1fr))");
    expect(mobileReferenceCard).toContain("grid-column: span 2");
    expect(mobileReferenceCard).toContain("min-height: 68px");
    expect(css.slice(mobileMediaStart)).toMatch(/\.reference-card:nth-child\(4\)[^{]*{[^}]*grid-column:\s*2 \/ span 2/s);
    expect(css.slice(mobileMediaStart)).toMatch(/\.reference-card:nth-child\(5\)[^{]*{[^}]*grid-column:\s*4 \/ span 2/s);
  });

  it("keeps production contact copy actions and mobile viewer controls touch friendly", () => {
    expect(blockFor(".contact-copy-action")).toContain("min-height: 44px");
    expect(blockFor(".image-viewer-back")).toContain("min-height: 44px");
    expect(blockFor(".image-viewer-mobile-reset")).toContain("width: 44px");
    expect(blockFor(".image-viewer-mobile-reset")).toContain("height: 44px");
  });

  it("centers the library empty state within the available scroll surface", () => {
    const emptyState = blockFor(".empty-state");

    expect(emptyState).toContain("min-height: 100%");
    expect(emptyState).toContain("align-content: center");
    expect(blockFor(".empty-state-detail")).toMatch(/font-size:\s*12px/);
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
    const compactPhoneStart = css.indexOf("@media (max-height: 640px) and (max-width: 520px)");

    expect(compactPhoneStart).not.toBe(-1);
    expect(blockFor(".preview-ink", compactPhoneStart)).toContain("aspect-ratio: 3 / 1");
    expect(blockFor(".option-grid", compactPhoneStart)).toContain("gap: 6px");
    expect(blockFor(".option-grid button", compactPhoneStart)).toContain("padding: 6px");
  });

  it("keeps selector artwork at 100 by 75 pixels on every phone height", () => {
    const baseOptionButton = blockFor(".option-grid button {");
    const baseOptionPreview = blockFor(".option-preview-frame {");
    const shortPhoneStart = css.indexOf("@media (max-height: 740px)");

    expect(shortPhoneStart).not.toBe(-1);
    expect(baseOptionButton).toContain("grid-template-columns: 100px minmax(0, 1fr)");
    expect(baseOptionButton).toContain("gap: 12px");
    expect(baseOptionButton).toContain("min-height: 92px");
    expect(baseOptionPreview).toContain("width: 100px");
    expect(baseOptionPreview).toContain("height: 75px");
    const shortPhoneRules = css.slice(shortPhoneStart);
    expect(shortPhoneRules).not.toMatch(/\.option-preview-frame\s*{[^}]*(?:width|height):/s);
    expect(shortPhoneRules).not.toMatch(/\.option-grid button\s*{[^}]*grid-template-columns:/s);
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
    const copyToast = blockFor(".copy-toast");

    expect(copyToast).toContain("position: fixed");
    expect(copyToast).toContain("left: 50%");
    expect(copyToast).toContain("transform: translateX(-50%)");
    expect(copyToast).toContain("bottom: 24px");
    expect(copyToast).toContain("background: #3f4542");
    expect(copyToast).not.toContain("background: #315b4d");
    expect(copyToast).toContain("pointer-events: none");
  });

  it("keeps consultation copy toasts above the bottom navigation", () => {
    expect(blockFor(".consult-copy-toast")).toMatch(
      /bottom:\s*calc\(24px \+ 54px \+ env\(safe-area-inset-bottom\)\)/
    );
  });

  it("shows complete result artwork and preview images without cropping", () => {
    expect(blockFor(".result-grid img,\n.image-placeholder")).toContain("object-fit: contain");
  });

  it("keeps library artwork images inside their thumbnail frame without cropping", () => {
    expect(blockFor(".library-thumb")).toContain("position: relative");
    expect(blockFor(".library-thumb img")).toContain("position: absolute");
    expect(blockFor(".library-thumb img")).toContain("inset: 0");
    expect(blockFor(".library-thumb img")).toContain("object-fit: contain");
  });

  it("uses a compact rectangular remove action beside library metadata", () => {
    const item = blockFor(".library-item {");
    const removeAction = blockFor(".library-remove-action");
    const footer = blockFor(".library-footer {");
    const narrowMediaStart = css.indexOf("@media (max-width: 420px)");
    const narrowItem = blockFor(".library-item {", narrowMediaStart);

    expect(item).toContain("grid-template-columns: 62px minmax(0, 1fr)");
    expect(narrowItem).toContain("grid-template-columns: 92px minmax(0, 1fr)");
    expect(blockFor(".library-thumb")).toContain("grid-row: 1 / span 2");
    expect(removeAction).toContain("width: 36px");
    expect(removeAction).toContain("height: 32px");
    expect(removeAction).toContain("min-height: 32px");
    expect(removeAction).toContain("border-radius: 6px");
    expect(footer).toContain("grid-column: 2");
    expect(footer).toContain("display: flex");
    expect(footer).toContain("justify-content: space-between");
    expect(footer).toContain("align-items: center");
  });

  it("draws the adjustment frame above the artwork image", () => {
    const frameOverlay = blockFor(".adjust-base::after");

    expect(frameOverlay).toContain("position: absolute");
    expect(frameOverlay).toContain("inset: 0");
    expect(frameOverlay).toContain("pointer-events: none");
    expect(frameOverlay).toMatch(/box-shadow:\s*inset/);
  });

  it("keeps compact result actions in one touch-friendly column", () => {
    const compactResultRules = css.slice(css.indexOf("@media (max-width: 420px)"));

    expect(compactResultRules).toMatch(/\.result-actions\s*{[^}]*grid-template-columns:\s*1fr/s);
    expect(blockFor(".result-action-button,\n.result-upload-action")).toContain("min-height: 44px");
  });

  it("uses artwork format classes for result, adjustment, and library media", () => {
    expect(blockFor(".artwork-format-vertical")).toContain("aspect-ratio: 3 / 4");
    expect(blockFor(".artwork-format-wide")).toContain("aspect-ratio: 2 / 1");
    expect(blockFor(".artwork-format-square")).toContain("aspect-ratio: 1 / 1");
    expect(css).toMatch(/\.library-thumb\.artwork-format-vertical/);
  });

  it("keeps adjust clear and submit actions thumb friendly", () => {
    expect(blockFor(".adjust-note-clear")).toContain("width: 44px");
    expect(blockFor(".adjust-note-clear")).toContain("height: 44px");
    expect(adjustViewSource).toMatch(/className="primary-action mobile-action-surface"/);
  });

  it("keeps the bottom tab chrome compact without shrinking tap targets", () => {
    expect(blockFor(".bottom-tabs {")).toContain("margin: 6px auto 0");
    expect(blockFor(".bottom-tabs {")).toMatch(/padding:\s*4px 6px calc\(4px \+ env\(safe-area-inset-bottom\)\)/);
    expect(blockFor(".bottom-tabs button")).toContain("min-height: 44px");
  });

  it("keeps image loading surfaces empty instead of patterned placeholders", () => {
    expect(blockFor(".preview-ink")).not.toMatch(/background:/);
    expect(blockFor(".preview-hero-image")).not.toMatch(/background:/);
    expect(blockFor(".option-preview-frame")).not.toMatch(/background:/);
    expect(blockFor(".expert-sample-frame")).not.toMatch(/background:/);
    expect(blockFor(".result-grid img,\n.image-placeholder")).not.toMatch(/background:/);
  });

  it("fits the loading image border directly to the image bounds", () => {
    expect(blockFor(".generating-visual")).not.toMatch(/border:/);
    expect(blockFor(".generating-visual img")).toContain("border: 1px solid rgba(88, 76, 61, 0.16)");
    expect(blockFor(".generating-visual img")).toContain("border-radius: inherit");
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
