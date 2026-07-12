import type { Tab } from "./navigation";

export const TAB_SCROLL_POSITIONS_KEY = "inkspire.tabScrollPositions.v1";
export const RECORD_SCROLL_POSITIONS_KEY = "inkspire.recordScrollPositions.v1";

export type TabScrollPositions = Record<Tab, number>;
export type RecordScrollPositions = Record<string, number>;

const tabs: Tab[] = ["studio", "library", "experts"];

export function createEmptyTabScrollPositions(): TabScrollPositions {
  return { studio: 0, library: 0, experts: 0 };
}

function validPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function recordScrollPositionKey(recordId: string, source: Tab): string {
  return `${source}:${encodeURIComponent(recordId)}`;
}

export function readTabScrollPositions(): TabScrollPositions {
  if (typeof window === "undefined") {
    return createEmptyTabScrollPositions();
  }
  try {
    const raw = window.sessionStorage.getItem(TAB_SCROLL_POSITIONS_KEY);
    if (!raw) {
      return createEmptyTabScrollPositions();
    }
    const stored = JSON.parse(raw) as Record<string, unknown>;
    return tabs.reduce<TabScrollPositions>((positions, tab) => {
      positions[tab] = validPosition(stored?.[tab]);
      return positions;
    }, createEmptyTabScrollPositions());
  } catch {
    return createEmptyTabScrollPositions();
  }
}

export function writeTabScrollPositions(positions: TabScrollPositions): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(TAB_SCROLL_POSITIONS_KEY, JSON.stringify(
      tabs.reduce<TabScrollPositions>((stored, tab) => {
        stored[tab] = validPosition(positions[tab]);
        return stored;
      }, createEmptyTabScrollPositions())
    ));
  } catch {
    return;
  }
}

export function readRecordScrollPositions(): RecordScrollPositions {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(RECORD_SCROLL_POSITIONS_KEY);
    if (!raw) {
      return {};
    }
    const stored = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(stored).reduce<RecordScrollPositions>((positions, [key, value]) => {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        positions[key] = value;
      }
      return positions;
    }, {});
  } catch {
    return {};
  }
}

export function writeRecordScrollPositions(positions: RecordScrollPositions): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(RECORD_SCROLL_POSITIONS_KEY, JSON.stringify(
      Object.fromEntries(Object.entries(positions).filter(([, value]) => (
        typeof value === "number" && Number.isFinite(value) && value >= 0
      )))
    ));
  } catch {
    return;
  }
}
