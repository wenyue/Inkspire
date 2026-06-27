import { describe, expect, it } from "vitest";
import {
  backCurrentTab,
  defaultTabRouteMemory,
  defaultTabHistoryState,
  fallbackPathForSource,
  normalizeTabHistoryRoute,
  normalizePathForTabMemory,
  pathForRecord,
  pushTabRoute,
  readTabHistoryState,
  readSourceTab,
  switchTabRoute,
  TAB_HISTORY_KEY,
  tabFromPath
} from "../src/navigation";

describe("navigation helpers", () => {
  it("derives the highlighted tab from plain pages", () => {
    expect(tabFromPath("/studio")).toBe("studio");
    expect(tabFromPath("/library")).toBe("library");
    expect(tabFromPath("/experts")).toBe("experts");
  });

  it("derives the highlighted tab from record pages using from", () => {
    expect(tabFromPath("/records/record-1?from=library")).toBe("library");
    expect(tabFromPath("/records/record-1/adjust?from=studio")).toBe("studio");
    expect(tabFromPath("/records/record-1/production?from=experts")).toBe("experts");
  });

  it("falls back to studio when from is missing or invalid", () => {
    expect(readSourceTab("?from=bad")).toBe("studio");
    expect(tabFromPath("/records/record-1")).toBe("studio");
    expect(tabFromPath("/records/?from=library")).toBe("studio");
    expect(tabFromPath("/records/record-1/unknown?from=library")).toBe("studio");
    expect(fallbackPathForSource("bad")).toBe("/studio");
  });

  it("builds stable record paths", () => {
    expect(pathForRecord("record-1", "library")).toBe("/records/record-1?from=library");
    expect(pathForRecord("record-1", "library", "adjust")).toBe("/records/record-1/adjust?from=library");
    expect(pathForRecord("record-1", "experts", "production")).toBe("/records/record-1/production?from=experts");
  });

  it("keeps only app routes in tab memory", () => {
    expect(normalizePathForTabMemory("library", "/records/record-1?from=library")).toBe("/records/record-1?from=library");
    expect(normalizePathForTabMemory("library", "/records/record-1/unknown?from=library")).toBe("/library");
    expect(normalizePathForTabMemory("library", "/records/record-1?from=studio")).toBe("/library");
    expect(normalizePathForTabMemory("library", "/unknown")).toBe("/library");
    expect(defaultTabRouteMemory.library).toBe("/library");
  });

  it("initializes independent tab history stacks", () => {
    expect(defaultTabHistoryState).toEqual({
      activeTab: "studio",
      stacks: {
        studio: ["/studio"],
        library: ["/library"],
        experts: ["/experts"]
      }
    });
  });

  it("normalizes routes for the tab history owner", () => {
    expect(normalizeTabHistoryRoute("/records/record-1?from=library")).toEqual({
      tab: "library",
      route: "/records/record-1?from=library"
    });
    expect(normalizeTabHistoryRoute("/records/record-1/production?from=experts")).toEqual({
      tab: "experts",
      route: "/records/record-1/production?from=experts"
    });
    expect(normalizeTabHistoryRoute("/records/record-1?from=bad")).toEqual({
      tab: "studio",
      route: "/records/record-1?from=bad"
    });
    expect(normalizeTabHistoryRoute("/unknown")).toEqual({
      tab: "studio",
      route: "/studio"
    });
  });

  it("pushes routes only into their owning tab stack without duplicates", () => {
    const withLibraryRecord = pushTabRoute(defaultTabHistoryState, "/records/record-1?from=library");
    expect(withLibraryRecord.activeTab).toBe("library");
    expect(withLibraryRecord.stacks.library).toEqual(["/library", "/records/record-1?from=library"]);
    expect(withLibraryRecord.stacks.studio).toEqual(["/studio"]);

    const repeated = pushTabRoute(withLibraryRecord, "/records/record-1?from=library");
    expect(repeated.stacks.library).toEqual(["/library", "/records/record-1?from=library"]);
  });

  it("switches tabs to the target tab stack top without mutating other stacks", () => {
    const state = pushTabRoute(defaultTabHistoryState, "/records/record-1?from=library");
    const switched = switchTabRoute(state, "studio");

    expect(switched.path).toBe("/studio");
    expect(switched.state.activeTab).toBe("studio");
    expect(switched.state.stacks.library).toEqual(["/library", "/records/record-1?from=library"]);
  });

  it("backs within the current tab stack and no-ops at the tab root", () => {
    const recordState = pushTabRoute(defaultTabHistoryState, "/records/record-1?from=library");
    const backToLibrary = backCurrentTab(recordState);

    expect(backToLibrary.path).toBe("/library");
    expect(backToLibrary.didGoBack).toBe(true);
    expect(backToLibrary.state.stacks.library).toEqual(["/library"]);

    const rootBack = backCurrentTab(backToLibrary.state);
    expect(rootBack.path).toBe("/library");
    expect(rootBack.didGoBack).toBe(false);
    expect(rootBack.state).toEqual(backToLibrary.state);
  });

  it("falls back to default tab history when session storage is invalid", () => {
    window.sessionStorage.setItem(TAB_HISTORY_KEY, JSON.stringify({ activeTab: "bad", stacks: {} }));

    expect(readTabHistoryState("/library")).toEqual(pushTabRoute(defaultTabHistoryState, "/library"));
  });
});
