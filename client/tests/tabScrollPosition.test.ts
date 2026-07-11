import { beforeEach, describe, expect, it } from "vitest";
import {
  TAB_SCROLL_POSITIONS_KEY,
  createEmptyTabScrollPositions,
  readTabScrollPositions,
  writeTabScrollPositions
} from "../src/tabScrollPosition";

describe("tab scroll positions", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts every bottom tab at the top", () => {
    expect(createEmptyTabScrollPositions()).toEqual({ studio: 0, library: 0, experts: 0 });
    expect(readTabScrollPositions()).toEqual({ studio: 0, library: 0, experts: 0 });
  });

  it("round trips independent positions through sessionStorage", () => {
    writeTabScrollPositions({ studio: 120, library: 240, experts: 360 });

    expect(readTabScrollPositions()).toEqual({ studio: 120, library: 240, experts: 360 });
    expect(window.localStorage.getItem(TAB_SCROLL_POSITIONS_KEY)).toBeNull();
  });

  it("falls back per tab when stored values are missing or invalid", () => {
    window.sessionStorage.setItem(TAB_SCROLL_POSITIONS_KEY, JSON.stringify({
      studio: -1,
      library: 240,
      experts: "360"
    }));

    expect(readTabScrollPositions()).toEqual({ studio: 0, library: 240, experts: 0 });
  });

  it("ignores corrupted storage", () => {
    window.sessionStorage.setItem(TAB_SCROLL_POSITIONS_KEY, "{");

    expect(readTabScrollPositions()).toEqual({ studio: 0, library: 0, experts: 0 });
  });
});
