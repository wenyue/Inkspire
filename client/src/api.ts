import appConfig from "../../config/app.json";
import experts from "../../config/experts.json";
import en from "../../config/i18n/en.json";
import ja from "../../config/i18n/ja.json";
import zhHans from "../../config/i18n/zh-Hans.json";
import zhHant from "../../config/i18n/zh-Hant.json";
import classicArtworks from "../../config/classic-artworks.json";
import questions from "../../config/questions.json";
import type { Answers, Locale, QuestionConfig, WorkType } from "./domain";
import type { Dictionaries } from "./i18n";

export type OriginTab = "studio" | "library" | "experts";
export type GenerationOperation = "create" | "adjust";
export type GenerationComplexity = "small" | "medium" | "large";

export interface ExpertService {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  priceEstimate: {
    base: number;
    currency: string;
    rule: string;
  };
}

export interface Expert {
  id: string;
  name: string | Record<string, string>;
  region: string | Record<string, string>;
  bio: string | Record<string, string>;
  phone?: string;
  wechat?: string;
  credentials?: Array<string | Record<string, string>>;
  sampleImages?: string[];
  services: ExpertService[];
}

export interface ClassicArtwork {
  id: string;
  title: Record<string, string>;
  artist: Record<string, string>;
  period: Record<string, string>;
  region: Record<string, string>;
  category: string;
  description: Record<string, string>;
  image: string;
  thumbnail: string;
  reference_focus: string;
  source_note: string;
}

export interface ProductionContact {
  phone?: string;
  wechat?: string;
}

export interface ArtworkSize {
  preset_id: string;
  label: string;
  width_cm: number;
  height_cm: number;
  reason?: string;
}

export interface GenerationProfile {
  created_at: string;
  total_ms: number;
  stages: Record<string, { total_ms: number; count: number }>;
  attempts: Array<{
    stage: string;
    attempt: number;
    status: "succeeded" | "failed";
    duration_ms: number;
    error?: string;
  }>;
}

export interface CalligraphyVerification {
  status: "verified" | "needs_review";
  detected_text?: string;
  issues?: string[];
  confidence?: number;
}

export interface GenerationDiagnostics {
  reason?: string;
}

export interface PublicConfig extends QuestionConfig {
  name?: string;
  defaultLocale?: Locale;
  image?: {
    maxInputSizeMb?: number;
  };
  productionContact?: ProductionContact;
  productionAvailable?: boolean;
  classicArtworks: ClassicArtwork[];
  experts: Expert[];
  i18n: Dictionaries;
}

export interface LibraryRecord {
  id: string;
  type: WorkType;
  title?: string;
  created_at?: string | null;
  thumbnail_path?: string | null;
  artwork_path?: string;
  fusion_path?: string;
  source_photo_path?: string;
  recommended_artwork_size?: ArtworkSize | null;
  generation_complexity?: GenerationComplexity;
  has_fusion?: boolean;
  favorite?: boolean;
  status?: string;
  fusion_status?: string;
  calligraphy_verification?: CalligraphyVerification;
  diagnostics?: GenerationDiagnostics | null;
  generation_profile?: GenerationProfile;
  answers?: Answers;
}

export type GenerationRecord = LibraryRecord;

export interface GenerationJob {
  id: string;
  user_id?: string;
  recordId: string;
  stage: "artwork" | "fusion_render";
  origin_tab?: OriginTab;
  operation?: GenerationOperation;
  type?: WorkType;
  title?: string;
  status: "queued" | "running" | "succeeded" | "failed";
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  error?: string;
  diagnostics?: GenerationDiagnostics | null;
  generation_profile?: GenerationProfile;
}

export interface GenerationStartResult {
  job?: GenerationJob;
  record?: GenerationRecord;
  limitReached?: boolean;
  code?: string;
  activeJobs?: GenerationJob[];
}

export interface ProductionEstimate {
  expert_id: string;
  size?: string;
  estimates: Record<string, { amount: number; currency: string; rule: string }>;
}

export interface ProductionOrder {
  id: string;
  record_id: string;
  expert_id: string;
  service_id: string;
  size: ArtworkSize;
  reference_level: number;
  created_at: string;
}

function hasContact(contact?: ProductionContact): boolean {
  return Boolean(contact?.phone || contact?.wechat);
}

export const fallbackConfig: PublicConfig = {
  name: appConfig.name,
  defaultLocale: appConfig.defaultLocale as Locale,
  image: appConfig.image,
  productionContact: appConfig.productionContact,
  productionAvailable: hasContact(appConfig.productionContact) || experts.some((expert) => hasContact(expert)),
  classicArtworks: classicArtworks as ClassicArtwork[],
  questions: questions as QuestionConfig["questions"],
  experts,
  i18n: {
    "zh-Hans": zhHans,
    "zh-Hant": zhHant,
    ja,
    en
  }
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `Request failed: ${status}`);
    this.status = status;
    this.payload = payload;
  }
}

export function isGenerationLimitError(error: unknown): error is ApiError {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && error.status === 429
    && "payload" in error
    && typeof error.payload === "object"
    && error.payload !== null
    && "code" in error.payload
    && (
      error.payload.code === "user_generation_limit_reached"
      || error.payload.code === "tab_generation_limit_reached"
    );
}

export function isPhotoTooLargeError(error: unknown): error is ApiError {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && error.status === 413
    && "payload" in error
    && typeof error.payload === "object"
    && error.payload !== null
    && "code" in error.payload
    && error.payload.code === "photo_too_large";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw new ApiError(response.status, payload);
  }
  return response.json() as Promise<T>;
}

export async function loadPublicConfig(): Promise<PublicConfig> {
  try {
    return await requestJson<PublicConfig>("/api/config/public");
  } catch {
    return fallbackConfig;
  }
}

export async function loadLibrary(): Promise<LibraryRecord[]> {
  try {
    const payload = await requestJson<{ records: LibraryRecord[] }>("/api/library");
    return payload.records;
  } catch {
    return [];
  }
}

export async function getRecord(recordId: string): Promise<GenerationRecord> {
  return requestJson(`/api/records/${recordId}`);
}

export async function getJob(jobId: string): Promise<GenerationJob> {
  return requestJson(`/api/jobs/${jobId}`);
}

export async function loadActiveJobs(): Promise<GenerationJob[]> {
  const payload = await requestJson<{ jobs: GenerationJob[] }>("/api/jobs/active");
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function uploadPhoto(file: File): Promise<{
  record_id: string;
  source_photo_path: string;
  scene?: { width: number; height: number; orientation: string };
  recommended_artwork_size?: ArtworkSize;
}> {
  const formData = new FormData();
  formData.append("photo", file);
  return requestJson("/api/uploads/photo", { method: "POST", body: formData });
}

export async function createGeneration(payload: {
  type: WorkType;
  answers: Answers;
  conversationNotes: string;
  source_photo_path?: string;
  recommended_artwork_size?: ArtworkSize | null;
  generation_complexity?: GenerationComplexity;
  origin_tab?: OriginTab;
  operation?: GenerationOperation;
}): Promise<GenerationStartResult> {
  return requestJson("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type,
      answers: payload.answers,
      conversationNotes: payload.conversationNotes,
      source_photo_path: payload.source_photo_path ?? "",
      recommended_artwork_size: payload.recommended_artwork_size ?? null,
      generation_complexity: payload.generation_complexity,
      origin_tab: payload.origin_tab ?? "studio",
      operation: payload.operation ?? "create"
    })
  });
}

export async function createFusion(
  recordId: string,
  sourcePhotoPath = "",
  origin_tab: OriginTab = "studio",
  operation: GenerationOperation = "create"
): Promise<GenerationStartResult> {
  return requestJson(`/api/records/${recordId}/fusion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_photo_path: sourcePhotoPath, origin_tab, operation })
  });
}

export async function regenerateRecord(
  recordId: string,
  metadata: { origin_tab: OriginTab; operation: GenerationOperation }
): Promise<GenerationStartResult> {
  return requestJson(`/api/records/${recordId}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata)
  });
}

export async function getProductionEstimate(recordId: string, expertId: string, size = "medium"): Promise<ProductionEstimate> {
  return requestJson(`/api/records/${recordId}/production-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expertId, size })
  });
}

export async function createProductionOrder(payload: {
  recordId: string;
  expertId: string;
  serviceId: string;
  size: ArtworkSize;
  referenceLevel: number;
}): Promise<ProductionOrder> {
  const response = await requestJson<{ order: ProductionOrder }>(`/api/records/${payload.recordId}/production-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expertId: payload.expertId,
      serviceId: payload.serviceId,
      size: payload.size,
      referenceLevel: payload.referenceLevel
    })
  });
  return response.order;
}

export async function getProductionOrder(orderId: string): Promise<ProductionOrder> {
  const response = await requestJson<{ order: ProductionOrder }>(`/api/production-orders/${orderId}`);
  return response.order;
}

export async function updateFavorite(recordId: string, favorite: boolean): Promise<GenerationRecord> {
  return requestJson(`/api/records/${recordId}/favorite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite })
  });
}
