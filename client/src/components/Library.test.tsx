import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import Library from "./Library";

const labels = {
  artwork: "作品",
  fusion: "作品与效果图",
  failed: "生成未完成",
  workTypePainting: "国画",
  workTypeCalligraphy: "书法",
  format: "形制",
  density: "疏密",
  densitySmall: "疏朗",
  densityMedium: "均衡",
  densityLarge: "繁密"
};

describe("Library", () => {
  test("shows saved work type, format, and density without inventing absent metadata", () => {
    render(<Library records={[{
      id: "one",
      type: "painting",
      title: "松风",
      artwork_path: "art.webp",
      answers: { painting_format: "竖幅" },
      generation_complexity: "small"
    }]} locale="zh-Hans" emptyLabel="空" labels={labels} />);

    expect(screen.getByText(/国画/)).toBeInTheDocument();
    expect(screen.getByText(/形制：竖幅/)).toBeInTheDocument();
    expect(screen.getByText(/疏密：疏朗/)).toBeInTheDocument();
  });

  test("localizes a saved format to the current interface language", () => {
    render(<Library records={[{
      id: "two",
      type: "calligraphy",
      title: "清风",
      artwork_path: "art.webp",
      answers: { calligraphy_layout: "立轴" }
    }]} locale="en" emptyLabel="Empty" labels={{
      ...labels,
      artwork: "Artwork",
      workTypeCalligraphy: "Calligraphy",
      format: "Format"
    }} />);

    expect(screen.getByText(/Format：Hanging Scroll/)).toBeInTheDocument();
    expect(screen.queryByText(/Format：立轴/)).not.toBeInTheDocument();
  });
});
