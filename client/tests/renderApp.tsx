import { render, type RenderOptions } from "@testing-library/react";
import AppRoot from "../src/AppRoot";

interface RenderAppOptions extends Omit<RenderOptions, "wrapper"> {
  initialRoute?: string;
  historyEntries?: string[];
}

export function renderApp({ initialRoute = "/", historyEntries, ...options }: RenderAppOptions = {}) {
  if (historyEntries && historyEntries.length > 0) {
    window.history.replaceState(null, "", historyEntries[0]);
    for (const route of historyEntries.slice(1)) {
      window.history.pushState(null, "", route);
    }
  } else {
    window.history.replaceState(null, "", initialRoute);
  }

  return render(<AppRoot />, options);
}
