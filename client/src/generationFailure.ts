import type { CalligraphyVerification } from "./api";

export type GenerationFailureKind = "classic_reference_unavailable" | "calligraphy_text_unverified";

interface GenerationFailureSource {
  diagnostics?: { reason?: unknown } | null;
  calligraphy_verification?: CalligraphyVerification;
}

export function generationFailureKind(source?: GenerationFailureSource | null): GenerationFailureKind | undefined {
  if (source?.diagnostics?.reason === "classic_reference_unavailable") {
    return "classic_reference_unavailable";
  }
  if (
    source?.diagnostics?.reason === "calligraphy_text_unverified"
    || source?.calligraphy_verification?.status === "needs_review"
  ) {
    return "calligraphy_text_unverified";
  }
  return undefined;
}
