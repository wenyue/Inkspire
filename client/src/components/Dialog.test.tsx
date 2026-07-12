import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import Dialog from "./Dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      {open ? (
        <Dialog title="Shared dialog" closeLabel="Close dialog" onClose={() => setOpen(false)}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Dialog>
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.classList.remove("dialog-open");
});

describe("Dialog", () => {
  test("renders modal semantics and focuses the close button", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(screen.getByRole("dialog", { name: "Shared dialog" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    expect(document.body).toHaveClass("dialog-open");
  });

  test("closes on Escape and restores focus to the opener", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();
    const focus = vi.spyOn(opener, "focus");
    fireEvent.click(opener);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.body).not.toHaveClass("dialog-open");
  });

  test("wraps keyboard focus inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Close dialog" });
    const last = screen.getByRole("button", { name: "Last action" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });
});
