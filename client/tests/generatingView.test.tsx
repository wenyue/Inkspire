import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GeneratingView from "../src/components/GeneratingView";

const copy: Record<string, string> = {
  "generationLoading.estimate.single": "Usually about 30 seconds. Please wait.",
  "generationLoading.estimate.double": "Usually about 50 seconds. Please wait.",
  "generationLoading.retry": "Try again",
  "generationLoading.failedTitle": "Generation did not finish",
  "generationLoading.failedHint": "Try again, or switch to another page first.",
  "generationLoading.create.painting": "The artist is painting",
  "generationLoading.adjust.adjustDetails": "The artist is refining the new draft"
};

function t(key: string): string {
  return copy[key] ?? key;
}

describe("GeneratingView", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders phase copy and a one-based loading image without a progress bar", () => {
    vi.setSystemTime(new Date("2026-06-27T10:00:10.000Z"));

    const { container } = render(
      <GeneratingView
        originTab="studio"
        operation="create"
        jobId="job-create"
        startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
        status="running"
        locale="en"
        t={t}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "The artist is painting" })).toBeInTheDocument();
    expect(screen.getByText("Usually about 30 seconds. Please wait.")).toBeInTheDocument();
    expect(container.querySelector(".generating-visual img")).toHaveAttribute(
      "src",
      expect.stringMatching(/^\/loading\/create-painting-[1-4]\.webp$/)
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows the longer estimate when one user action will generate artwork and preview", () => {
    vi.setSystemTime(new Date("2026-06-27T10:00:10.000Z"));

    render(
      <GeneratingView
        originTab="studio"
        operation="create"
        jobId="job-create-preview"
        startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
        status="running"
        locale="en"
        t={t}
        expectsPreviewGeneration
      />
    );

    expect(screen.getByText("Usually about 50 seconds. Please wait.")).toBeInTheDocument();
  });

  it("shows failure copy and calls retry from the retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <GeneratingView
        originTab="library"
        operation="adjust"
        jobId="job-adjust"
        startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
        status="failed"
        error="Timed out"
        locale="en"
        t={t}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("heading", { name: "Generation did not finish" })).toBeInTheDocument();
    expect(screen.getByText("Timed out")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not show retry for failed sessions without a retry handler", () => {
    render(
      <GeneratingView
        originTab="studio"
        operation="create"
        jobId="job-failed"
        startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
        status="failed"
        error="No payload"
        locale="en"
        t={t}
      />
    );

    expect(screen.getByRole("heading", { name: "Generation did not finish" })).toBeInTheDocument();
    expect(screen.getByText("No payload")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("does not announce succeeded sessions as busy", () => {
    const { container } = render(
      <GeneratingView
        originTab="experts"
        operation="create"
        jobId="job-succeeded"
        startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
        status="succeeded"
        locale="en"
        t={t}
        onRetry={vi.fn()}
      />
    );

    expect(container.querySelector(".generating-view")).toHaveAttribute("aria-busy", "false");
  });
});
