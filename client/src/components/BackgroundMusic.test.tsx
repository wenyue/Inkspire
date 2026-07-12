import { fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackgroundMusic from "./BackgroundMusic";

const TRACKS = [
  "/audio/nield-grohm-hanging-4.mp3",
  "/audio/relaxation-05.mp3",
  "/audio/nature-meditation.mp3"
];

class FakeAudio extends EventTarget {
  readonly initialSrc: string;
  src: string;
  preload = "";
  volume = 1;
  play = vi.fn<[], Promise<void>>(() => Promise.resolve());
  pause = vi.fn<[], void>();
  load = vi.fn<[], void>();
  removeAttribute = vi.fn<[string], void>((name) => {
    if (name === "src") {
      this.src = "";
    }
  });

  constructor(src = "") {
    super();
    this.initialSrc = src;
    this.src = src;
  }
}

describe("BackgroundMusic", () => {
  let instances: FakeAudio[];
  let playResults: Array<"resolve" | "reject">;

  beforeEach(() => {
    instances = [];
    playResults = [];
    vi.stubGlobal("Audio", vi.fn((src?: string) => {
      const audio = new FakeAudio(src);
      const result = playResults.shift() ?? "resolve";
      audio.play.mockImplementation(() => result === "resolve"
        ? Promise.resolve()
        : Promise.reject(new Error("unavailable")));
      instances.push(audio);
      return audio;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for the first interaction and starts once at low volume", async () => {
    render(<BackgroundMusic />);

    expect(instances).toHaveLength(0);
    fireEvent.pointerDown(document.body);
    expect(instances).toHaveLength(0);
    fireEvent.click(document.body);

    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].src).toBe(TRACKS[0]);
    expect(instances[0].preload).toBe("auto");
    expect(instances[0].volume).toBe(0.12);
    expect(instances[0].play).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(instances).toHaveLength(1);
  });

  it("plays each track in order and loops back to the first", async () => {
    render(<BackgroundMusic />);
    fireEvent.keyDown(document.body, { key: "Enter" });
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].play).toHaveBeenCalledTimes(1);

    instances[0].dispatchEvent(new Event("ended"));
    await waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[1].initialSrc).toBe(TRACKS[1]);
    expect(instances[1].play).toHaveBeenCalledTimes(1);

    instances[1].dispatchEvent(new Event("ended"));
    await waitFor(() => expect(instances).toHaveLength(3));
    expect(instances[2].initialSrc).toBe(TRACKS[2]);
    expect(instances[2].play).toHaveBeenCalledTimes(1);

    instances[2].dispatchEvent(new Event("ended"));
    await waitFor(() => expect(instances).toHaveLength(4));
    expect(instances[3].initialSrc).toBe(TRACKS[0]);
    expect(instances[3].play).toHaveBeenCalledTimes(1);
  });

  it("skips rejected or failed tracks and stops after one failed pass", async () => {
    playResults.push("reject", "resolve", "reject");
    render(<BackgroundMusic />);
    fireEvent.click(document.body);

    await waitFor(() => expect(instances).toHaveLength(2));
    instances[1].dispatchEvent(new Event("error"));

    await waitFor(() => expect(instances).toHaveLength(3));
    expect(instances.map((audio) => audio.initialSrc)).toEqual(TRACKS);
    await waitFor(() => {
      expect(instances).toHaveLength(3);
      expect(instances[2].pause).toHaveBeenCalledTimes(1);
      expect(instances[2].removeAttribute).toHaveBeenCalledWith("src");
      expect(instances[2].load).toHaveBeenCalledTimes(1);
    });
  });

  it("skips a track that errors during playback", async () => {
    render(<BackgroundMusic />);
    fireEvent.click(document.body);
    await waitFor(() => expect(instances).toHaveLength(1));

    instances[0].dispatchEvent(new Event("error"));
    await waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[1].initialSrc).toBe(TRACKS[1]);
  });

  it("ignores events from a released prior track", async () => {
    render(<BackgroundMusic />);
    fireEvent.click(document.body);
    await waitFor(() => expect(instances).toHaveLength(1));

    instances[0].dispatchEvent(new Event("ended"));
    await waitFor(() => expect(instances).toHaveLength(2));

    instances[0].dispatchEvent(new Event("error"));
    instances[0].dispatchEvent(new Event("ended"));
    expect(instances).toHaveLength(2);
  });

  it("starts only one audio instance in StrictMode", async () => {
    render(
      <StrictMode>
        <BackgroundMusic />
      </StrictMode>
    );

    fireEvent.click(document.body);

    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].play).toHaveBeenCalledTimes(1);
  });

  it("removes interaction listeners and releases current audio on unmount", async () => {
    const preInteractionView = render(<BackgroundMusic />);
    preInteractionView.unmount();

    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(instances).toHaveLength(0);

    const playbackView = render(<BackgroundMusic />);
    fireEvent.click(document.body);
    await waitFor(() => expect(instances).toHaveLength(1));

    playbackView.unmount();

    expect(instances[0].pause).toHaveBeenCalledTimes(1);
    expect(instances[0].removeAttribute).toHaveBeenCalledWith("src");
    expect(instances[0].load).toHaveBeenCalledTimes(1);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(instances).toHaveLength(1);
  });
});
