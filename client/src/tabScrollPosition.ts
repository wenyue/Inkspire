import type { Tab } from "./navigation";

export const TAB_SCROLL_POSITIONS_KEY = "inkspire.tabScrollPositions.v1";

export type TabScrollPositions = Record<Tab, number>;

const tabs: Tab[] = ["studio", "library", "experts"];

export function createEmptyTabScrollPositions(): TabScrollPositions {
  return { studio: 0, library: 0, experts: 0 };
}

function validPosition(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
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
