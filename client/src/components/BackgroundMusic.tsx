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
