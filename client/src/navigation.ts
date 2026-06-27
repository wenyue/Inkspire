export type Tab = "studio" | "library" | "experts";
export type RecordRouteKind = "result" | "adjust" | "production";

export interface TabRouteMemory {
  studio: string;
  library: string;
  experts: string;
}

export interface TabHistoryState {
  activeTab: Tab;
  stacks: Record<Tab, string[]>;
}

export const TAB_ROUTE_MEMORY_KEY = "inkspire.tabRouteMemory.v1";
export const TAB_HISTORY_KEY = "inkspire.tabHistory.v1";
export const LEGACY_ACTIVE_TAB_KEY = "inkspire.activeTab";
export const LEGACY_CURRENT_RECORD_KEY = "inkspire.currentRecordId";

export const defaultTabRouteMemory: TabRouteMemory = {
  studio: "/studio",
  library: "/library",
  experts: "/experts"
};

export const defaultTabHistoryState: TabHistoryState = {
  activeTab: "studio",
  stacks: {
    studio: ["/studio"],
    library: ["/library"],
    experts: ["/experts"]
  }
};

const tabs: Tab[] = ["studio", "library", "experts"];

export function isTab(value: string | null | undefined): value is Tab {
  return value === "studio" || value === "library" || value === "experts";
}

export function readSourceTab(search: string): Tab {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  return isTab(from) ? from : "studio";
}

export function fallbackPathForSource(source: string | null | undefined): string {
  return isTab(source) ? `/${source}` : "/studio";
}

function isRecordRoutePath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "records" || !parts[1]) {
    return false;
  }
  return parts.length === 2 || (parts.length === 3 && (parts[2] === "adjust" || parts[2] === "production"));
}

export function pathForRecord(recordId: string, source: Tab, kind: RecordRouteKind = "result"): string {
  const suffix = kind === "result" ? "" : `/${kind}`;
  return `/records/${encodeURIComponent(recordId)}${suffix}?from=${source}`;
}

export function tabFromPath(pathWithSearch: string): Tab {
  const url = new URL(pathWithSearch, "http://inkspire.local");
  if (url.pathname === "/library") {
    return "library";
  }
  if (url.pathname === "/experts") {
    return "experts";
  }
  if (isRecordRoutePath(url.pathname)) {
    return readSourceTab(url.search);
  }
  return "studio";
}

export function normalizePathForTabMemory(tab: Tab, pathWithSearch: string): string {
  const url = new URL(pathWithSearch, "http://inkspire.local");
  if (url.pathname === `/${tab}`) {
    return `${url.pathname}${url.search}`;
  }
  if (isRecordRoutePath(url.pathname) && readSourceTab(url.search) === tab) {
    return `${url.pathname}${url.search}`;
  }
  return defaultTabRouteMemory[tab];
}

function isTabRouteMemory(value: unknown): value is TabRouteMemory {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<TabRouteMemory>;
  return typeof candidate.studio === "string"
    && typeof candidate.library === "string"
    && typeof candidate.experts === "string";
}

export function readTabRouteMemory(): TabRouteMemory {
  if (typeof window === "undefined") {
    return defaultTabRouteMemory;
  }
  try {
    const raw = window.localStorage.getItem(TAB_ROUTE_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!isTabRouteMemory(parsed)) {
      return defaultTabRouteMemory;
    }
    return {
      studio: normalizePathForTabMemory("studio", parsed.studio),
      library: normalizePathForTabMemory("library", parsed.library),
      experts: normalizePathForTabMemory("experts", parsed.experts)
    };
  } catch {
    return defaultTabRouteMemory;
  }
}

export function writeTabRouteMemory(memory: TabRouteMemory) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TAB_ROUTE_MEMORY_KEY, JSON.stringify(memory));
}

export function rememberTabRoute(memory: TabRouteMemory, pathWithSearch: string): TabRouteMemory {
  const tab = tabFromPath(pathWithSearch);
  return {
    ...memory,
    [tab]: normalizePathForTabMemory(tab, pathWithSearch)
  };
}

export function normalizeTabHistoryRoute(pathWithSearch: string): { tab: Tab; route: string } {
  const tab = tabFromPath(pathWithSearch);
  return {
    tab,
    route: normalizePathForTabMemory(tab, pathWithSearch)
  };
}

function dedupeAdjacent(routes: string[]): string[] {
  return routes.filter((route, index) => index === 0 || route !== routes[index - 1]);
}

function normalizedStack(tab: Tab, routes: unknown): string[] {
  const root = defaultTabRouteMemory[tab];
  if (!Array.isArray(routes)) {
    return [root];
  }
  const normalized = routes
    .filter((route): route is string => typeof route === "string")
    .map((route) => normalizePathForTabMemory(tab, route));
  const withRoot = normalized[0] === root ? normalized : [root, ...normalized];
  const deduped = dedupeAdjacent(withRoot);
  return deduped.length > 0 ? deduped : [root];
}

function normalizeHistoryState(value: unknown): TabHistoryState {
  if (!value || typeof value !== "object") {
    return defaultTabHistoryState;
  }
  const candidate = value as Partial<TabHistoryState>;
  const activeTab = isTab(candidate.activeTab) ? candidate.activeTab : "studio";
  const stacks = candidate.stacks && typeof candidate.stacks === "object"
    ? candidate.stacks as Partial<Record<Tab, unknown>>
    : {};
  return {
    activeTab,
    stacks: {
      studio: normalizedStack("studio", stacks.studio),
      library: normalizedStack("library", stacks.library),
      experts: normalizedStack("experts", stacks.experts)
    }
  };
}

function withUpdatedStack(state: TabHistoryState, tab: Tab, stack: string[]): TabHistoryState {
  return {
    activeTab: tab,
    stacks: {
      ...state.stacks,
      [tab]: stack
    }
  };
}

export function pushTabRoute(state: TabHistoryState, pathWithSearch: string): TabHistoryState {
  const normalizedState = normalizeHistoryState(state);
  const { tab, route } = normalizeTabHistoryRoute(pathWithSearch);
  const root = defaultTabRouteMemory[tab];
  if (route === root) {
    return withUpdatedStack(normalizedState, tab, [root]);
  }
  const stack = normalizedState.stacks[tab] ?? [root];
  const nextStack = stack[stack.length - 1] === route ? stack : [...stack, route];
  return withUpdatedStack(normalizedState, tab, nextStack);
}

export function replaceTabRoute(state: TabHistoryState, pathWithSearch: string): TabHistoryState {
  const normalizedState = normalizeHistoryState(state);
  const { tab, route } = normalizeTabHistoryRoute(pathWithSearch);
  const root = defaultTabRouteMemory[tab];
  if (route === root) {
    return withUpdatedStack(normalizedState, tab, [root]);
  }
  const stack = normalizedState.stacks[tab] ?? [root];
  const nextStack = dedupeAdjacent([...stack.slice(0, -1), route]);
  return withUpdatedStack(normalizedState, tab, nextStack[0] === root ? nextStack : [root, ...nextStack]);
}

export function switchTabRoute(state: TabHistoryState, tab: Tab): { state: TabHistoryState; path: string } {
  const normalizedState = normalizeHistoryState(state);
  const stack = normalizedState.stacks[tab] ?? [defaultTabRouteMemory[tab]];
  return {
    state: {
      ...normalizedState,
      activeTab: tab
    },
    path: stack[stack.length - 1] ?? defaultTabRouteMemory[tab]
  };
}

export function backCurrentTab(state: TabHistoryState): { state: TabHistoryState; path: string; didGoBack: boolean } {
  const normalizedState = normalizeHistoryState(state);
  const tab = normalizedState.activeTab;
  const stack = normalizedState.stacks[tab] ?? [defaultTabRouteMemory[tab]];
  if (stack.length <= 1) {
    return {
      state: normalizedState,
      path: stack[0] ?? defaultTabRouteMemory[tab],
      didGoBack: false
    };
  }
  const nextStack = stack.slice(0, -1);
  return {
    state: withUpdatedStack(normalizedState, tab, nextStack),
    path: nextStack[nextStack.length - 1] ?? defaultTabRouteMemory[tab],
    didGoBack: true
  };
}

export function readTabHistoryState(currentPath = "/studio"): TabHistoryState {
  if (typeof window === "undefined") {
    return pushTabRoute(defaultTabHistoryState, currentPath);
  }
  try {
    const raw = window.sessionStorage.getItem(TAB_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return pushTabRoute(normalizeHistoryState(parsed), currentPath);
  } catch {
    return pushTabRoute(defaultTabHistoryState, currentPath);
  }
}

export function writeTabHistoryState(state: TabHistoryState) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(TAB_HISTORY_KEY, JSON.stringify(normalizeHistoryState(state)));
}

export function migrateLegacyNavigationPath(): string {
  if (typeof window === "undefined") {
    return "/studio";
  }
  const activeTab = window.localStorage.getItem(LEGACY_ACTIVE_TAB_KEY);
  const currentRecordId = window.localStorage.getItem(LEGACY_CURRENT_RECORD_KEY);
  window.localStorage.removeItem(LEGACY_ACTIVE_TAB_KEY);
  window.localStorage.removeItem(LEGACY_CURRENT_RECORD_KEY);
  const source = isTab(activeTab) ? activeTab : "studio";
  return currentRecordId ? pathForRecord(currentRecordId, source) : `/${source}`;
}
