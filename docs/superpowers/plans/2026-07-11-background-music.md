# Background Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three bundled royalty-free instrumental tracks that begin at low volume on the user's first page interaction and continue in a hidden sequential loop.

**Architecture:** A root-level `BackgroundMusic` React component owns the browser audio lifecycle, first-interaction listeners, sequential track selection, bounded failure fallback, and cleanup. Static MP3 files and their provenance live together under `client/public/audio/`; no server, persistence, route, or visible UI changes are required.

**Tech Stack:** React 18, TypeScript, browser `Audio`, Vitest, Testing Library, Vite static assets, PowerShell asset download commands

---

## File Map

- Create `client/public/audio/nield-grohm-hanging-4.mp3`: traditional, mystical, meditative opening track.
- Create `client/public/audio/relaxation-05.mp3`: flute-and-harp middle track.
- Create `client/public/audio/nature-meditation.mp3`: ambient closing track.
- Create `client/public/audio/README.md`: source, author, license, retrieval date, and original asset URL for every bundled track.
- Create `client/src/components/BackgroundMusic.tsx`: hidden audio lifecycle owner.
- Create `client/src/components/BackgroundMusic.test.tsx`: focused behavior tests using a fake `Audio` implementation.
- Modify `client/src/AppRoot.tsx`: mount the audio owner once outside route content.
- Modify `client/vitest.setup.ts`: make unmocked media methods deterministic in the jsdom test environment.

### Task 1: Bundle licensed music assets and provenance

**Files:**
- Create: `client/public/audio/nield-grohm-hanging-4.mp3`
- Create: `client/public/audio/relaxation-05.mp3`
- Create: `client/public/audio/nature-meditation.mp3`
- Create: `client/public/audio/README.md`

- [ ] **Step 1: Download the three exact Mixkit assets**

Run from the repository root:

```powershell
New-Item -ItemType Directory -Force client/public/audio | Out-Null
Invoke-WebRequest -UseBasicParsing "https://assets.mixkit.co/music/541/541.mp3" -OutFile "client/public/audio/nield-grohm-hanging-4.mp3"
Invoke-WebRequest -UseBasicParsing "https://assets.mixkit.co/music/749/749.mp3" -OutFile "client/public/audio/relaxation-05.mp3"
Invoke-WebRequest -UseBasicParsing "https://assets.mixkit.co/music/345/345.mp3" -OutFile "client/public/audio/nature-meditation.mp3"
```

Expected: all three commands succeed and create non-empty MP3 files.

- [ ] **Step 2: Verify the downloaded files match the expected response sizes**

Run:

```powershell
Get-ChildItem client/public/audio/*.mp3 | Select-Object Name, Length
```

Expected:

```text
nature-meditation.mp3          3202447
nield-grohm-hanging-4.mp3      7379786
relaxation-05.mp3              4709354
```

If Mixkit changes file encoding while retaining valid `audio/mpeg` responses, record the observed sizes in the implementation notes and verify each file is larger than 1 MB instead of forcing old byte counts.

- [ ] **Step 3: Add the provenance record**

Create `client/public/audio/README.md` with:

```markdown
# Background music assets

Retrieved from Mixkit on 2026-07-11. Mixkit lists Stock Music under the Mixkit Stock Music Free License and explicitly permits free music use on websites. Attribution is not required, but source details are retained here for review.

License: https://mixkit.co/license/#musicFree
Music usage FAQ: https://mixkit.co/free-stock-music/

| Local file | Track | Artist | Duration | Source page | Original asset |
| --- | --- | --- | --- | --- | --- |
| `nield-grohm-hanging-4.mp3` | Nield Grohm Hanging 4 | Eugenio Mininni | 3:51 | https://mixkit.co/free-stock-music/tag/meditation/ | https://assets.mixkit.co/music/541/541.mp3 |
| `relaxation-05.mp3` | Relaxation 05 | Lily J | 1:58 | https://mixkit.co/free-stock-music/tag/meditation/ | https://assets.mixkit.co/music/749/749.mp3 |
| `nature-meditation.mp3` | Nature Meditation | Arulo | 1:40 | https://mixkit.co/free-stock-music/tag/meditation/ | https://assets.mixkit.co/music/345/345.mp3 |

Do not redistribute these files as a standalone music library or claim ownership of the recordings.
```

- [ ] **Step 4: Commit the asset bundle**

```powershell
git add client/public/audio
git commit -m "assets: add licensed background music"
```

Expected: the commit contains exactly the three MP3 files and their `README.md`.

### Task 2: Specify the audio lifecycle with failing tests

**Files:**
- Create: `client/src/components/BackgroundMusic.test.tsx`
- Modify: `client/vitest.setup.ts`

- [ ] **Step 1: Stub ordinary jsdom media methods for the wider client suite**

Append to `client/vitest.setup.ts`:

```ts
Object.defineProperties(HTMLMediaElement.prototype, {
  load: {
    configurable: true,
    value: () => undefined
  },
  pause: {
    configurable: true,
    value: () => undefined
  },
  play: {
    configurable: true,
    value: () => Promise.resolve()
  }
});
```

This prevents unrelated application interaction tests from invoking jsdom's unimplemented media methods after the root component is mounted.

- [ ] **Step 2: Write the fake audio test harness and behavior tests**

Create `client/src/components/BackgroundMusic.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run the focused test and confirm the component is missing**

Run:

```powershell
npm run test --workspace client -- src/components/BackgroundMusic.test.tsx
```

Expected: FAIL because `./BackgroundMusic` does not exist.

- [ ] **Step 4: Commit the failing behavioral contract**

```powershell
git add client/vitest.setup.ts client/src/components/BackgroundMusic.test.tsx
git commit -m "test: define background music lifecycle"
```

Expected: the commit contains only the test setup and failing focused test.

### Task 3: Implement the hidden sequential player

**Files:**
- Create: `client/src/components/BackgroundMusic.tsx`

- [ ] **Step 1: Add the minimal lifecycle implementation**

Create `client/src/components/BackgroundMusic.tsx`:

```tsx
import { useEffect } from "react";

const BACKGROUND_MUSIC_TRACKS = [
  "/audio/nield-grohm-hanging-4.mp3",
  "/audio/relaxation-05.mp3",
  "/audio/nature-meditation.mp3"
] as const;

const BACKGROUND_MUSIC_VOLUME = 0.12;

export default function BackgroundMusic() {
  useEffect(() => {
    let currentAudio: {
      audio: HTMLAudioElement;
      onEnded: () => void;
      onError: () => void;
    } | null = null;
    let disposed = false;
    let started = false;

    const releaseCurrentAudio = () => {
      if (!currentAudio) {
        return;
      }
      const { audio, onEnded, onError } = currentAudio;
      currentAudio = null;
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };

    const playTrack = (trackIndex: number, failedTrackCount: number) => {
      if (disposed) {
        return;
      }
      if (failedTrackCount >= BACKGROUND_MUSIC_TRACKS.length) {
        releaseCurrentAudio();
        return;
      }

      releaseCurrentAudio();
      const audio = new Audio(BACKGROUND_MUSIC_TRACKS[trackIndex]);
      audio.preload = "auto";
      audio.volume = BACKGROUND_MUSIC_VOLUME;
      let trackFinished = false;

      const moveToTrack = (nextTrackIndex: number, nextFailedTrackCount: number) => {
        if (disposed || trackFinished) {
          return;
        }
        trackFinished = true;
        playTrack(nextTrackIndex, nextFailedTrackCount);
      };

      const nextTrackIndex = (trackIndex + 1) % BACKGROUND_MUSIC_TRACKS.length;
      const onEnded = () => moveToTrack(nextTrackIndex, 0);
      const onError = () => moveToTrack(nextTrackIndex, failedTrackCount + 1);
      currentAudio = { audio, onEnded, onError };
      audio.addEventListener("ended", onEnded, { once: true });
      audio.addEventListener("error", onError, { once: true });
      void audio.play().catch(() => moveToTrack(nextTrackIndex, failedTrackCount + 1));
    };

    const removeStartListeners = () => {
      window.removeEventListener("click", startPlayback);
      window.removeEventListener("keydown", startPlayback);
    };

    const startPlayback = () => {
      if (started) {
        return;
      }
      started = true;
      removeStartListeners();
      playTrack(0, 0);
    };

    window.addEventListener("click", startPlayback);
    window.addEventListener("keydown", startPlayback);

    return () => {
      disposed = true;
      removeStartListeners();
      releaseCurrentAudio();
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Run the focused tests and verify all lifecycle cases pass**

Run:

```powershell
npm run test --workspace client -- src/components/BackgroundMusic.test.tsx
```

Expected: 7 tests PASS.

- [ ] **Step 3: Run the client type checker**

Run:

```powershell
npm run typecheck --workspace client
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Commit the player implementation**

```powershell
git add client/src/components/BackgroundMusic.tsx
git commit -m "feat: add interaction-started background music"
```

Expected: the commit contains only the new component.

### Task 4: Mount once at the application root

**Files:**
- Modify: `client/src/AppRoot.tsx`

- [ ] **Step 1: Mount `BackgroundMusic` outside route content**

Replace `client/src/AppRoot.tsx` with:

```tsx
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import BackgroundMusic from "./components/BackgroundMusic";

export default function AppRoot() {
  return (
    <>
      <BackgroundMusic />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </>
  );
}
```

- [ ] **Step 2: Run the focused component and application tests**

Run:

```powershell
npm run test --workspace client -- src/components/BackgroundMusic.test.tsx tests/app.test.tsx
```

Expected: both test files PASS without jsdom media errors.

- [ ] **Step 3: Commit the root integration**

```powershell
git add client/src/AppRoot.tsx
git commit -m "feat: mount background music at app root"
```

Expected: the commit contains only `client/src/AppRoot.tsx`.

### Task 5: Verify the complete client surface

**Files:**
- Verify only; no expected source changes

- [ ] **Step 1: Run the entire client test suite**

Run:

```powershell
npm run test --workspace client
```

Expected: all client tests PASS.

- [ ] **Step 2: Run the client type checker**

Run:

```powershell
npm run typecheck --workspace client
```

Expected: exit code 0.

- [ ] **Step 3: Build the production client**

Run:

```powershell
npm run build --workspace client
```

Expected: Vite build succeeds.

- [ ] **Step 4: Confirm the built audio bundle is complete**

Run:

```powershell
Get-ChildItem client/dist/audio | Select-Object Name, Length
```

Expected: `README.md` and all three MP3 files appear; each MP3 is larger than 1 MB.

- [ ] **Step 5: Check the final diff for whitespace errors and scope**

Run:

```powershell
git diff --check HEAD~4
git status --short
```

Expected: no whitespace errors. Status may still show pre-existing unrelated Inkspire work, but the background-music changes are limited to the files listed in this plan.
