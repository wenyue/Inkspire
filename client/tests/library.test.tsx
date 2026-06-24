import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Library from "../src/components/Library";

const labels = {
  artwork: "作品",
  fusion: "作品与融合图",
  failed: "生成未完成"
};

describe("Library", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders generated artwork thumbnails instead of text placeholders", () => {
    render(
      <Library
        records={[
          {
            id: "record-1",
            type: "painting",
            title: "山水",
            thumbnail_path: "records/record-1/artwork.webp",
            has_fusion: false,
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    const image = screen.getByRole("img", { name: "山水" });
    expect(image).toHaveAttribute("src", "/api/records/record-1/images/artwork");
    expect(screen.getByText("作品")).toBeInTheDocument();
    expect(screen.queryByText("画")).not.toBeInTheDocument();
  });

  it("uses fusion thumbnails when a record has a fusion render", () => {
    render(
      <Library
        records={[
          {
            id: "record-2",
            type: "calligraphy",
            title: "清风入怀",
            thumbnail_path: "records/record-2/fusion.webp",
            has_fusion: true,
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByRole("img", { name: "清风入怀" })).toHaveAttribute(
      "src",
      "/api/records/record-2/images/fusion"
    );
    expect(screen.getByText("作品与融合图")).toBeInTheDocument();
  });

  it("shows a clear unavailable state when a saved thumbnail fails to load", () => {
    render(
      <Library
        records={[
          {
            id: "record-broken",
            type: "painting",
            title: "断图山水",
            thumbnail_path: "records/record-broken/artwork.webp",
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "断图山水" }));

    expect(screen.queryByRole("img", { name: "断图山水" })).not.toBeInTheDocument();
    expect(screen.getByText("图像暂不可用")).toBeInTheDocument();
  });

  it("adds useful metadata so similar saved works can be distinguished", () => {
    render(
      <Library
        records={[
          {
            id: "record-5",
            type: "painting",
            title: "山水",
            thumbnail_path: "records/record-5/artwork.webp",
            has_fusion: false,
            status: "succeeded",
            created_at: "2026-06-24T12:30:00.000Z"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByText(/作品 ·/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("keeps remove from library as a secondary icon action", () => {
    render(
      <Library
        records={[
          {
            id: "record-6",
            type: "painting",
            title: "可移除作品",
            thumbnail_path: "records/record-6/artwork.webp",
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={{ ...labels, removeFavorite: "移出藏卷" }}
        onFavoriteToggle={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "移出藏卷" })).toHaveClass("library-remove-action");
    expect(screen.queryByText("移出藏卷")).not.toBeInTheDocument();
  });

  it("clears the default button surface from library open actions", () => {
    render(
      <Library
        records={[
          {
            id: "record-7",
            type: "painting",
            title: "无灰底作品",
            thumbnail_path: "records/record-7/artwork.webp",
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByRole("button", { name: /查看 无灰底作品/ })).toHaveClass("surface-clear-button");
  });

  it("keeps a compact placeholder for failed records without thumbnails", () => {
    render(
      <Library
        records={[{ id: "record-3", type: "calligraphy", title: "失败记录", status: "failed" }]}
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.queryByRole("img", { name: "失败记录" })).not.toBeInTheDocument();
    expect(screen.getByText("书")).toBeInTheDocument();
    expect(screen.getByText("生成未完成")).toBeInTheDocument();
  });

  it("opens a saved record from the library item", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <Library
        records={[
          {
            id: "record-4",
            type: "painting",
            title: "可查看作品",
            thumbnail_path: "records/record-4/artwork.webp",
            has_fusion: false,
            status: "succeeded"
          }
        ]}
        emptyLabel="暂无作品"
        labels={labels}
        onOpen={onOpen}
      />
    );

    await user.click(screen.getByRole("button", { name: /查看 可查看作品/ }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "record-4" }));
  });
});
