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
  test("shows the painting generation parameters in their creation order", () => {
    render(<Library records={[{
      id: "one",
      type: "painting",
      title: "松风",
      artwork_path: "art.webp",
      answers: {
        painting_subject: "山水",
        painting_brushwork: "工笔",
        painting_palette: "水墨",
        painting_format: "竖幅"
      },
      generation_complexity: "small"
    }]} locale="zh-Hans" emptyLabel="空" labels={labels} />);

    expect(screen.getByText("国画 · 山水 · 工笔 · 水墨")).toBeInTheDocument();
    expect(screen.queryByText(/形制：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/疏密：/)).not.toBeInTheDocument();
  });

  test("shows the referenced classic artwork in the generation parameters", () => {
    render(<Library records={[{
      id: "classic",
      type: "painting",
      title: "松风",
      artwork_path: "art.webp",
      answers: {
        creation_mode: "classic_reference",
        classic_artwork_title: "照夜白图"
      }
    }]} locale="zh-Hans" emptyLabel="空" labels={{ ...labels, classicReference: "仿名作" }} />);

    expect(screen.getByText("国画 · 仿名作《照夜白图》")).toBeInTheDocument();
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

    expect(screen.getByText("Calligraphy · Hanging Scroll")).toBeInTheDocument();
    expect(screen.queryByText(/立轴/)).not.toBeInTheDocument();
  });
});
