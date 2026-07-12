import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useState } from "react";
import type { ClassicArtwork } from "../api";
import ClassicArtworkPicker from "./ClassicArtworkPicker";

afterEach(cleanup);

function artwork(id: string, title: string, artist = "Artist"): ClassicArtwork {
  return {
    id,
    title: { "zh-Hans": title, "zh-Hant": title, en: title },
    artist: { "zh-Hans": artist, "zh-Hant": artist, en: artist },
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

function Picker({ artworks }: { artworks: ClassicArtwork[] }) {
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  return <ClassicArtworkPicker
    artworks={artworks}
    locale="zh-Hans"
    selectedArtworkId={selectedArtworkId}
    onSelectedArtworkIdChange={setSelectedArtworkId}
    onSelect={vi.fn()}
  />;
}

describe("ClassicArtworkPicker", () => {
  test("curates verified Chinese metadata and reveals the collection progressively", () => {
    const artworks = [
      artwork("中国-han-gan-night-shining-white-39901", "照夜白图", "传 唐 · 韩幹"),
      ...Array.from({ length: 15 }, (_, index) => artwork(`other-${index}`, `Work ${index}`))
    ];
    render(<Picker artworks={artworks} />);

    expect(screen.queryByRole("heading", { name: "东亚历代绘画" })).not.toBeInTheDocument();
    expect(screen.getByText("照夜白图")).toBeInTheDocument();
    expect(screen.getByText(/韩幹/)).toBeInTheDocument();
    expect(screen.queryByText("Work 14")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部策展馆藏" }));
    fireEvent.click(screen.getByRole("button", { name: /再看/ }));
    expect(screen.getByText("Work 14")).toBeInTheDocument();
  });

  test("shows curated catalogue metadata and collection provenance in detail", () => {
    render(<Picker artworks={[artwork("night", "Night-Shining White")]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Night" } });
    fireEvent.click(screen.getByRole("button", { name: /Night-Shining White/ }));
    expect(screen.getByText("大都会艺术博物馆")).toBeInTheDocument();
    expect(screen.getByText("馆藏")).toBeInTheDocument();
    expect(screen.queryByText(/开放获取|藏品 39901/)).not.toBeInTheDocument();
    expect(document.querySelector(".classic-detail .classic-kicker")).not.toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.queryByText(/尚未策展核验/)).not.toBeInTheDocument();
  });
});
