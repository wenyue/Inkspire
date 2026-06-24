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
  services: ExpertService[];
}

export interface PublicConfig extends QuestionConfig {
  name?: string;
  defaultLocale?: Locale;
  experts: Expert[];
  i18n: Dictionaries;
}

export interface LibraryRecord {
  id: string;
  type: WorkType;
  title?: string;
  thumbnail_path?: string | null;
  artwork_path?: string;
  fusion_path?: string;
  source_photo_path?: string;
  has_fusion?: boolean;
  favorite?: boolean;
  status?: string;
}

export interface GenerationRecord extends LibraryRecord {
  answers?: Answers;
}

export interface ProductionEstimate {
  expert_id: string;
  estimates: Record<string, { amount: number; currency: string; rule: string }>;
}

export const fallbackConfig: PublicConfig = {
  name: appConfig.name,
  defaultLocale: appConfig.defaultLocale as Locale,
  questions,
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

export async function uploadPhoto(file: File): Promise<{ record_id: string; source_photo_path: string }> {
  const formData = new FormData();
  formData.append("photo", file);
  return requestJson("/api/uploads/photo", { method: "POST", body: formData });
}

export async function createGeneration(payload: {
  type: WorkType;
  answers: Answers;
  conversationNotes: string;
  source_photo_path?: string;
}): Promise<{ record?: GenerationRecord } & GenerationRecord> {
  return requestJson("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type,
      answers: payload.answers,
      conversationNotes: payload.conversationNotes,
      source_photo_path: payload.source_photo_path ?? ""
    })
  });
}

export async function createFusion(recordId: string): Promise<GenerationRecord> {
  const payload = await requestJson<{ record?: GenerationRecord } & GenerationRecord>(`/api/records/${recordId}/fusion`, {
    method: "POST"
  });
  return payload.record ?? payload;
}

export async function getProductionEstimate(recordId: string, expertId: string): Promise<ProductionEstimate> {
  return requestJson(`/api/records/${recordId}/production-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expertId })
  });
}
