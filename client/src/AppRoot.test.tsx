import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import AppRoot from "./AppRoot";

vi.mock("react-router-dom", () => ({
  BrowserRouter: ({ children }: { children: ReactNode }) => (
    <div data-testid="browser-router">{children}</div>
  )
}));

vi.mock("./App", () => ({
  default: () => <div data-testid="app" />
}));

vi.mock("./components/BackgroundMusic", () => ({
  default: () => <div data-testid="background-music" />
}));

describe("AppRoot", () => {
  it("mounts background music exactly once outside the browser router", () => {
    render(<AppRoot />);

    const [backgroundMusic] = screen.getAllByTestId("background-music");
    const browserRouter = screen.getByTestId("browser-router");

    expect(screen.getAllByTestId("background-music")).toHaveLength(1);
    expect(browserRouter).toContainElement(screen.getByTestId("app"));
    expect(browserRouter).not.toContainElement(backgroundMusic);
  });
});
