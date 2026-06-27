import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, isGenerationLimitError } from "../src/api";
import {
  generationPhase,
  loadingImageIndex,
  readGenerationSessions,
  writeGenerationSessions,
  type GenerationSessionMap
} from "../src/generationSession";

describe("generation session helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("selects create phases by elapsed seconds", () => {
    expect(generationPhase("create", 0)).toEqual({ labelKey: "thinking", imageStage: "thinking" });
    expect(generationPhase("create", 4)).toEqual({ labelKey: "thinking", imageStage: "thinking" });
    expect(generationPhase("create", 5)).toEqual({ labelKey: "paper", imageStage: "paper" });
    expect(generationPhase("create", 7)).toEqual({ labelKey: "paper", imageStage: "paper" });
    expect(generationPhase("create", 8)).toEqual({ labelKey: "painting", imageStage: "painting" });
    expect(generationPhase("create", 19)).toEqual({ labelKey: "painting", imageStage: "painting" });
    expect(generationPhase("create", 20)).toEqual({ labelKey: "details", imageStage: "details" });
  });

  it("selects adjust phases by elapsed seconds", () => {
    expect(generationPhase("adjust", 0)).toEqual({ labelKey: "understanding", imageStage: "understanding" });
    expect(generationPhase("adjust", 4)).toEqual({ labelKey: "understanding", imageStage: "understanding" });
    expect(generationPhase("adjust", 5)).toEqual({ labelKey: "direction", imageStage: "direction" });
    expect(generationPhase("adjust", 7)).toEqual({ labelKey: "direction", imageStage: "direction" });
    expect(generationPhase("adjust", 8)).toEqual({ labelKey: "repainting", imageStage: "repainting" });
    expect(generationPhase("adjust", 19)).toEqual({ labelKey: "repainting", imageStage: "repainting" });
    expect(generationPhase("adjust", 20)).toEqual({ labelKey: "adjustDetails", imageStage: "adjust-details" });
  });

  it("keeps loading image selection stable for the same seed and phase", () => {
    const first = loadingImageIndex("job-1", "create", "painting", 5);
    const second = loadingImageIndex("job-1", "create", "painting", 5);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(5);
    expect(loadingImageIndex("job-1", "create", "painting", 0)).toBe(0);
  });

  it("round trips per-tab sessions in localStorage", () => {
    const sessions: GenerationSessionMap = {
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-a",
        resultRecordId: "record-a",
        startedAt: 1000,
        status: "running",
        payload: { type: "painting", answers: {}, conversationNotes: "" }
      }
    };

    writeGenerationSessions(sessions);

    expect(readGenerationSessions()).toEqual(sessions);
  });

  it("returns an empty session map for corrupted localStorage", () => {
    window.localStorage.setItem("inkspire.generationSessions.v1", "{");

    expect(readGenerationSessions()).toEqual({});
  });

  it("returns an empty session map for valid JSON with invalid session shape", () => {
    for (const storedValue of [
      [],
      { studio: { status: "running" } },
      {
        studio: {
          originTab: "library",
          operation: "create",
          jobId: "job-a",
          startedAt: 1000,
          status: "running",
          payload: {}
        }
      },
      {
        studio: {
          originTab: "studio",
          operation: "create",
          jobId: "",
          startedAt: Number.NaN,
          status: "running",
          payload: {}
        }
      },
      {
        studio: {
          originTab: "studio",
          operation: "paint",
          jobId: "job-a",
          startedAt: 1000,
          status: "running",
          payload: []
        }
      }
    ]) {
      window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify(storedValue));

      expect(readGenerationSessions()).toEqual({});
    }
  });

  it("preserves valid sessions when other stored tab entries are invalid", () => {
    const librarySession = {
      originTab: "library",
      operation: "adjust",
      jobId: "job-library",
      sourceRecordId: "record-source",
      resultRecordId: "record-result",
      startedAt: 2000,
      status: "failed",
      payload: {},
      error: "failed"
    };
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: { status: "running" },
      library: librarySession,
      experts: {
        originTab: "experts",
        operation: "create",
        jobId: "job-experts",
        sourceRecordId: 123,
        startedAt: 3000,
        status: "running",
        payload: {}
      },
      unknown: {
        originTab: "unknown",
        operation: "create",
        jobId: "job-unknown",
        startedAt: 4000,
        status: "running",
        payload: {}
      }
    }));

    expect(readGenerationSessions()).toEqual({ library: librarySession });
  });

  it("rejects sessions with malformed payload fields", () => {
    for (const payload of [
      { type: "poster" },
      { answers: [] },
      { answers: null },
      { conversationNotes: 123 },
      { source_photo_path: 123 },
      { recommended_artwork_size: [] },
      {
        recommended_artwork_size: {
          preset_id: "medium",
          label: "Medium",
          width_cm: "30",
          height_cm: 40
        }
      },
      {
        recommended_artwork_size: {
          preset_id: "medium",
          label: "Medium",
          width_cm: 30,
          height_cm: Number.POSITIVE_INFINITY
        }
      },
      {
        recommended_artwork_size: {
          preset_id: "medium",
          label: "Medium",
          width_cm: 30,
          height_cm: 40,
          reason: 123
        }
      }
    ]) {
      window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
        studio: {
          originTab: "studio",
          operation: "create",
          jobId: "job-a",
          startedAt: 1000,
          status: "running",
          payload
        }
      }));

      expect(readGenerationSessions()).toEqual({});
    }
  });

  it("preserves valid payload fields and removes unknown nested fields", () => {
    window.localStorage.setItem("inkspire.generationSessions.v1", JSON.stringify({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-a",
        startedAt: 1000,
        status: "running",
        payload: {
          type: "calligraphy",
          answers: { work_type: "calligraphy", text: "松风" },
          conversationNotes: "make it lighter",
          source_photo_path: "uploads/source.webp",
          recommended_artwork_size: {
            preset_id: "medium",
            label: "Medium",
            width_cm: 30,
            height_cm: 40,
            reason: "balanced",
            extra: "ignored"
          },
          extraPayloadField: "ignored"
        }
      }
    }));

    expect(readGenerationSessions()).toEqual({
      studio: {
        originTab: "studio",
        operation: "create",
        jobId: "job-a",
        startedAt: 1000,
        status: "running",
        payload: {
          type: "calligraphy",
          answers: { work_type: "calligraphy", text: "松风" },
          conversationNotes: "make it lighter",
          source_photo_path: "uploads/source.webp",
          recommended_artwork_size: {
            preset_id: "medium",
            label: "Medium",
            width_cm: 30,
            height_cm: 40,
            reason: "balanced"
          }
        }
      }
    });
  });
});

describe("generation limit errors", () => {
  it("accepts old and new generation limit codes", () => {
    expect(isGenerationLimitError(new ApiError(429, { code: "user_generation_limit_reached" }))).toBe(true);
    expect(isGenerationLimitError(new ApiError(429, { code: "tab_generation_limit_reached" }))).toBe(true);
    expect(isGenerationLimitError(new ApiError(429, { code: "other_limit" }))).toBe(false);
  });
});
