import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ClassicArtwork } from "../api";
import ClassicArtworkPicker from "./ClassicArtworkPicker";

afterEach(cleanup);

function artwork(id: string, title: string): ClassicArtwork {
  return {
    id,
    title: { "zh-Hans": title, "zh-Hant": title, en: title },
    artist: { "zh-Hans": "Artist", "zh-Hant": "Artist", en: "Artist" },
    period: { "zh-Hans": "Period", "zh-Hant": "Period", en: "Period" },
    region: { "zh-Hans": "中国", "zh-Hant": "中國", en: "China" },
    category: "山水",
    description: { "zh-Hans": "Description", "zh-Hant": "Description", en: "Description" },
    image: `/${id}.webp`,
    thumbnail: `/${id}-thumb.webp`,
    reference_focus: "",
    source_note: "Metropolitan Museum of Art Open Access object 39901; processed."
  };
}

describe("ClassicArtworkPicker", () => {
  test("curates verified Chinese metadata and reveals the collection progressively", () => {
    const artworks = [
      artwork("中国-han-gan-night-shining-white-39901", "Night-Shining White"),
      ...Array.from({ length: 15 }, (_, index) => artwork(`other-${index}`, `Work ${index}`))
    ];
    render(<ClassicArtworkPicker artworks={artworks} locale="zh-Hans" onSelect={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "东亚历代绘画" })).not.toBeInTheDocument();
    expect(screen.getByText("照夜白图")).toBeInTheDocument();
    expect(screen.getByText(/韩幹/)).toBeInTheDocument();
    expect(screen.queryByText("Work 14")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部馆藏 · 保留原题" }));
    fireEvent.click(screen.getByRole("button", { name: /再看/ }));
    expect(screen.getByText("Work 14")).toBeInTheDocument();
  });

  test("searches raw source metadata and shows collection provenance in detail", () => {
    render(<ClassicArtworkPicker artworks={[artwork("night", "Night-Shining White")]} locale="zh-Hans" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Night" } });
    fireEvent.click(screen.getByRole("button", { name: /Night-Shining White/ }));
    expect(screen.getByText(/大都会艺术博物馆 · 开放获取 · 藏品 39901/)).toBeInTheDocument();
    expect(screen.getByText("馆藏原始编目 · 尚未策展核验")).toBeInTheDocument();
    expect(screen.getByText("此件尚未完成中文策展核验，暂保留馆藏原始题名、作者与年代。")).toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});
