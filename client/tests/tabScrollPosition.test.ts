import { beforeEach, describe, expect, it } from "vitest";
import {
  RECORD_SCROLL_POSITIONS_KEY,
  TAB_SCROLL_POSITIONS_KEY,
  createEmptyTabScrollPositions,
  readRecordScrollPositions,
  readTabScrollPositions,
  recordScrollPositionKey,
  writeRecordScrollPositions,
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

  it("stores artwork scroll positions separately by record and source tab", () => {
    const libraryRecord = recordScrollPositionKey("record-1", "library");
    const studioRecord = recordScrollPositionKey("record-1", "studio");

    writeRecordScrollPositions({ [libraryRecord]: 480, [studioRecord]: 120 });

    expect(readRecordScrollPositions()).toEqual({ [libraryRecord]: 480, [studioRecord]: 120 });
    expect(window.sessionStorage.getItem(RECORD_SCROLL_POSITIONS_KEY)).not.toBeNull();
    expect(readTabScrollPositions()).toEqual({ studio: 0, library: 0, experts: 0 });
  });

  it("drops invalid artwork scroll positions from storage", () => {
    const validKey = recordScrollPositionKey("record-1", "library");
    window.sessionStorage.setItem(RECORD_SCROLL_POSITIONS_KEY, JSON.stringify({
      [validKey]: 320,
      invalidNegative: -1,
      invalidString: "240"
    }));

    expect(readRecordScrollPositions()).toEqual({ [validKey]: 320 });
  });
});
