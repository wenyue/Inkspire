import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
});
