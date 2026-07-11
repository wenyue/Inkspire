import type { GenerationComplexity, GenerationOperation, GenerationRecord, OriginTab } from "./api";
import type { Answers, WorkType } from "./domain";
import type { GenerationFailureKind } from "./generationFailure";

const STORAGE_KEY = "inkspire.generationSessions.v1";
const ORIGIN_TABS: OriginTab[] = ["studio", "library", "experts"];
const OPERATIONS: GenerationOperation[] = ["create", "adjust"];
const GENERATION_COMPLEXITIES: GenerationComplexity[] = ["small", "medium", "large"];
const STATUSES: GenerationSessionStatus[] = ["running", "succeeded", "failed"];
const WORK_TYPES: WorkType[] = ["painting", "calligraphy"];

export type GenerationSessionStatus = "running" | "succeeded" | "failed";
export type LoadingPhaseKey =
  | "thinking"
  | "paper"
  | "painting"
  | "details"
  | "understanding"
  | "direction"
  | "repainting"
  | "adjustDetails";

export interface GenerationSessionPayload {
  type?: WorkType;
  answers?: Answers;
  conversationNotes?: string;
  source_photo_path?: string;
  recommended_artwork_size?: GenerationRecord["recommended_artwork_size"] | null;
  generation_complexity?: GenerationComplexity;
}

export interface GenerationSession {
  originTab: OriginTab;
  operation: GenerationOperation;
  jobId: string;
  sourceRecordId?: string;
  resultRecordId?: string;
  startedAt: number;
  status: GenerationSessionStatus;
  payload: GenerationSessionPayload;
  error?: string;
  failureKind?: GenerationFailureKind;
}

export type GenerationSessionMap = Partial<Record<OriginTab, GenerationSession>>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGenerationOperation(value: unknown): value is GenerationOperation {
  return OPERATIONS.includes(value as GenerationOperation);
}

function isGenerationComplexity(value: unknown): value is GenerationComplexity {
  return GENERATION_COMPLEXITIES.includes(value as GenerationComplexity);
}

function isGenerationSessionStatus(value: unknown): value is GenerationSessionStatus {
  return STATUSES.includes(value as GenerationSessionStatus);
}

function isWorkType(value: unknown): value is WorkType {
  return WORK_TYPES.includes(value as WorkType);
}

function optionalStringIsValid(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isGenerationFailureKind(value: unknown): value is GenerationFailureKind {
  return value === "classic_reference_unavailable" || value === "calligraphy_text_unverified";
}

function parseArtworkSize(value: unknown): GenerationRecord["recommended_artwork_size"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!isObject(value)
    || !isString(value.preset_id)
    || !isString(value.label)
    || !isFiniteNumber(value.width_cm)
    || !isFiniteNumber(value.height_cm)
    || !optionalStringIsValid(value.reason)
  ) {
    return undefined;
  }

  const size: NonNullable<GenerationRecord["recommended_artwork_size"]> = {
    preset_id: value.preset_id,
    label: value.label,
    width_cm: value.width_cm,
    height_cm: value.height_cm
  };
  if (value.reason !== undefined) {
    size.reason = value.reason;
  }
  return size;
}

function parseGenerationSessionPayload(value: unknown): GenerationSessionPayload | null {
  if (!isObject(value)
    || (value.type !== undefined && !isWorkType(value.type))
    || (value.answers !== undefined && !isObject(value.answers))
    || !optionalStringIsValid(value.conversationNotes)
    || !optionalStringIsValid(value.source_photo_path)
    || (value.generation_complexity !== undefined && !isGenerationComplexity(value.generation_complexity))
  ) {
    return null;
  }

  const recommendedArtworkSize = parseArtworkSize(value.recommended_artwork_size);
  if (value.recommended_artwork_size !== undefined && recommendedArtworkSize === undefined) {
    return null;
  }

  const payload: GenerationSessionPayload = {};
  if (value.type !== undefined) {
    payload.type = value.type;
  }
  if (value.answers !== undefined) {
    payload.answers = value.answers as Answers;
  }
  if (value.conversationNotes !== undefined) {
    payload.conversationNotes = value.conversationNotes;
  }
  if (value.source_photo_path !== undefined) {
    payload.source_photo_path = value.source_photo_path;
  }
  if (value.generation_complexity !== undefined) {
    payload.generation_complexity = value.generation_complexity;
  }
  if (value.recommended_artwork_size !== undefined) {
    payload.recommended_artwork_size = recommendedArtworkSize;
  }
  return payload;
}

function parseGenerationSession(tab: OriginTab, value: unknown): GenerationSession | null {
  if (!isObject(value)
    || value.originTab !== tab
    || !isGenerationOperation(value.operation)
    || !isNonEmptyString(value.jobId)
    || !isFiniteNumber(value.startedAt)
    || !isGenerationSessionStatus(value.status)
    || !isObject(value.payload)
    || !optionalStringIsValid(value.sourceRecordId)
    || !optionalStringIsValid(value.resultRecordId)
    || !optionalStringIsValid(value.error)
    || (value.failureKind !== undefined && !isGenerationFailureKind(value.failureKind))
  ) {
    return null;
  }

  const payload = parseGenerationSessionPayload(value.payload);
  if (!payload) {
    return null;
  }

  const session: GenerationSession = {
    originTab: tab,
    operation: value.operation,
    jobId: value.jobId,
    startedAt: value.startedAt,
    status: value.status,
    payload
  };

  if (value.sourceRecordId !== undefined) {
    session.sourceRecordId = value.sourceRecordId;
  }
  if (value.resultRecordId !== undefined) {
    session.resultRecordId = value.resultRecordId;
  }
  if (value.error !== undefined) {
    session.error = value.error;
  }
  if (value.failureKind !== undefined) {
    session.failureKind = value.failureKind;
  }

  return session;
}

export function readGenerationSessions(): GenerationSessionMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isObject(parsed)) {
      return {};
    }

    const sessions: GenerationSessionMap = {};
    for (const tab of ORIGIN_TABS) {
      const session = parseGenerationSession(tab, parsed[tab]);
      if (session) {
        sessions[tab] = session;
      }
    }
    return sessions;
  } catch {
    return {};
  }
}

export function writeGenerationSessions(sessions: GenerationSessionMap): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignore unavailable or full storage; generation state can still be recovered from active jobs.
  }
}

export function generationPhase(
  operation: GenerationOperation,
  elapsedSeconds: number
): { labelKey: LoadingPhaseKey; imageStage: string } {
  if (operation === "adjust") {
    if (elapsedSeconds < 5) {
      return { labelKey: "understanding", imageStage: "understanding" };
    }
    if (elapsedSeconds < 8) {
      return { labelKey: "direction", imageStage: "direction" };
    }
    if (elapsedSeconds < 20) {
      return { labelKey: "repainting", imageStage: "repainting" };
    }
    return { labelKey: "adjustDetails", imageStage: "adjust-details" };
  }

  if (elapsedSeconds < 5) {
    return { labelKey: "thinking", imageStage: "thinking" };
  }
  if (elapsedSeconds < 8) {
    return { labelKey: "paper", imageStage: "paper" };
  }
  if (elapsedSeconds < 20) {
    return { labelKey: "painting", imageStage: "painting" };
  }
  return { labelKey: "details", imageStage: "details" };
}

export function loadingImageIndex(
  seed: string,
  operation: GenerationOperation,
  stage: string,
  count: number
): number {
  if (count <= 0) {
    return 0;
  }

  const source = `${seed}:${operation}:${stage}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index);
  }
  return Math.abs(hash) % count;
}
