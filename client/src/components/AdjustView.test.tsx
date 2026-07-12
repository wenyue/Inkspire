import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdjustView from "./AdjustView";

afterEach(cleanup);

function renderAdjustView(overrides: {
  onClose?: () => void;
  onSubmit?: (note: string) => void;
} = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  const onSubmit = overrides.onSubmit ?? vi.fn();
  render(
    <AdjustView
      title="调整这张作品"
      intro="描述调整方向"
      placeholder="请输入调整方向"
      submitLabel="生成新作品"
      submittingLabel="生成中"
      closeLabel="返回作品"
      clearLabel="清空"
      suggestions={["留白更多"]}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
  return { onClose, onSubmit };
}

describe("AdjustView", () => {
  test("renders an adjustment dialog without the current artwork", () => {
    renderAdjustView();

    const dialog = screen.getByRole("dialog", { name: "调整这张作品" });
    expect(dialog).toHaveClass("shared-dialog", "adjust-dialog");
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("当前作品")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成新作品" })).toBeDisabled();
  });

  test("supports suggestions, clearing, and trimmed submission", () => {
    const { onSubmit } = renderAdjustView();
    const note = screen.getByRole("textbox", { name: "调整这张作品" });

    fireEvent.click(screen.getByRole("button", { name: "留白更多" }));
    expect(note).toHaveValue("留白更多");
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(note).toHaveValue("");

    fireEvent.change(note, { target: { value: "  设色更克制  " } });
    fireEvent.click(screen.getByRole("button", { name: "生成新作品" }));
    expect(onSubmit).toHaveBeenCalledWith("设色更克制");
  });

  test("closes from the dialog close button", () => {
    const onClose = vi.fn();
    renderAdjustView({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "返回作品" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
