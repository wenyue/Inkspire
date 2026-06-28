import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Library from "../src/components/Library";

const labels = {
  artwork: "作品",
  fusion: "作品与效果图",
  failed: "生成未完成",
  openRecord: "查看作品",
  removeFavorite: "移出藏卷",
  removeFavoriteShort: "移出",
  removeConfirmTitle: "从藏卷移出？",
  removeConfirmHint: "作品记录不会删除。",
  removeConfirmCancel: "取消",
  removeConfirmAction: "移出"
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
        locale="zh-Hans"
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
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByRole("img", { name: "清风入怀" })).toHaveAttribute(
      "src",
      "/api/records/record-2/images/fusion"
    );
    expect(screen.getByText("作品与效果图")).toBeInTheDocument();
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
        locale="zh-Hans"
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
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByText(/作品 ·/)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("keeps the full calligraphy title in the rendered text", () => {
    const longTitle = "明月松间照清泉石上流竹喧归浣女莲动下渔舟";

    render(
      <Library
        records={[
          {
            id: "record-long-calligraphy",
            type: "calligraphy",
            title: longTitle,
            thumbnail_path: "records/record-long-calligraphy/artwork.webp",
            status: "succeeded"
          }
        ]}
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(longTitle) })).toBeInTheDocument();
  });

  it("makes opening saved records visible on the card", () => {
    render(
      <Library
        records={[
          {
            id: "record-visible-open",
            type: "painting",
            title: "明显可打开作品",
            thumbnail_path: "records/record-visible-open/artwork.webp",
            status: "succeeded"
          }
        ]}
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByText("查看作品")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看作品 明显可打开作品/ })).toHaveTextContent("查看作品");
  });

  it("asks for confirmation before moving a work out of the library", async () => {
    const user = userEvent.setup();
    const onFavoriteToggle = vi.fn();
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
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
        onFavoriteToggle={onFavoriteToggle}
      />
    );

    await user.click(screen.getByRole("button", { name: "移出藏卷" }));

    expect(onFavoriteToggle).not.toHaveBeenCalled();
    expect(screen.getByText("从藏卷移出？")).toBeInTheDocument();
    expect(screen.getByText("作品记录不会删除。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移出" }));

    expect(onFavoriteToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "record-6" }), false);
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
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
      />
    );

    expect(screen.getByRole("button", { name: /查看作品 无灰底作品/ })).toHaveClass("surface-clear-button");
  });

  it("keeps a compact placeholder for failed records without thumbnails", () => {
    render(
      <Library
        records={[{ id: "record-3", type: "calligraphy", title: "失败记录", status: "failed" }]}
        locale="zh-Hans"
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
        locale="zh-Hans"
        emptyLabel="暂无作品"
        labels={labels}
        onOpen={onOpen}
      />
    );

    await user.click(screen.getByRole("button", { name: /查看作品 可查看作品/ }));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "record-4" }));
  });
});
