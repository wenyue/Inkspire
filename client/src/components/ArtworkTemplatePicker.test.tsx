import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ArtworkTemplatePicker from "./ArtworkTemplatePicker";

describe("ArtworkTemplatePicker", () => {
  it("renders 20 localized large preview images and selects the owning template", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ArtworkTemplatePicker locale="zh-Hans" onSelect={onSelect} />,
    );

    const images = container.querySelectorAll<HTMLImageElement>(".template-preview-image");
    expect(images).toHaveLength(20);
    expect(images[0]).toHaveAttribute("src", "/previews/templates/ink-landscape.webp");
    expect(images[0]).toHaveAttribute("alt", "水墨山水");

    fireEvent.click(screen.getByRole("button", { name: /水墨山水/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "ink-landscape" }));
  });
});
