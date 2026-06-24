import appConfig from "../../config/app.json";
import experts from "../../config/experts.json";
import en from "../../config/i18n/en.json";
import zhHans from "../../config/i18n/zh-Hans.json";
import zhHant from "../../config/i18n/zh-Hant.json";
import questions from "../../config/questions.json";
import type { Answers, Locale, QuestionConfig, WorkType } from "./domain";
import type { Dictionaries } from "./i18n";

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
  name: string;
  region: string;
  bio: string;
  phone?: string;
  wechat?: string;
  credentials?: string[];
  sampleImages?: string[];
  services: ExpertService[];
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

export interface PublicConfig extends QuestionConfig {
  name?: string;
  defaultLocale?: Locale;
  productionContact?: ProductionContact;
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
  has_fusion?: boolean;
  favorite?: boolean;
  status?: string;
  fusion_status?: string;
}

export interface GenerationRecord extends LibraryRecord {
  answers?: Answers;
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

export const fallbackConfig: PublicConfig = {
  name: appConfig.name,
  defaultLocale: appConfig.defaultLocale as Locale,
  productionContact: appConfig.productionContact,
  questions: questions as QuestionConfig["questions"],
  experts,
  i18n: {
    "zh-Hans": zhHans,
    "zh-Hant": zhHant,
    en
  }
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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
}): Promise<{ record?: GenerationRecord } & GenerationRecord> {
  return requestJson("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type,
      answers: payload.answers,
      conversationNotes: payload.conversationNotes,
      source_photo_path: payload.source_photo_path ?? "",
      recommended_artwork_size: payload.recommended_artwork_size ?? null
    })
  });
}

export async function createFusion(recordId: string, sourcePhotoPath = ""): Promise<GenerationRecord> {
  const payload = await requestJson<{ job?: { status?: string; error?: string }; record?: GenerationRecord } & GenerationRecord>(`/api/records/${recordId}/fusion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_photo_path: sourcePhotoPath })
  });
  if (payload.job?.status === "failed") {
    throw new Error(payload.job.error || "Fusion generation failed");
  }
  return payload.record ?? payload;
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
