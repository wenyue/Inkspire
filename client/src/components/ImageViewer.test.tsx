import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ImageViewer from "./ImageViewer";

const copy: Record<string, string> = {
  "imageViewer.back": "Back",
  "imageViewer.error": "Image is temporarily unavailable",
  "imageViewer.gestureHint": "Pinch to zoom · Double-tap to enlarge",
  "imageViewer.resetZoom": "Reset zoom",
  "imageViewer.controls": "Image zoom controls",
  "imageViewer.zoomOut": "Zoom out",
  "imageViewer.reset": "Reset",
  "imageViewer.zoomIn": "Zoom in"
};

function t(key: string): string {
  return copy[key] ?? key;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("ImageViewer", () => {
  test("uses localized visible text and accessible labels", () => {
    render(<ImageViewer src="/art.webp" alt="Artwork" t={t} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByText("Pinch to zoom · Double-tap to enlarge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset zoom" })).toBeInTheDocument();
    expect(screen.getByLabelText("Image zoom controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  });

  test("traps keyboard focus inside the modal", () => {
    render(<ImageViewer src="/art.webp" alt="Artwork" t={t} onClose={vi.fn()} />);

    const back = screen.getByRole("button", { name: "Back" });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    expect(back).toHaveFocus();

    zoomIn.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(back).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(zoomIn).toHaveFocus();
  });

  test("restores focus to the opener when closed", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(<ImageViewer src="/art.webp" alt="Artwork" t={t} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
