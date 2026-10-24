import type { ExtractedMeal } from "@/lib/meal-plan-schema";

export type AiProviderName = "gemini" | "claude" | "openai";

export type AiResult =
  | { ok: true; meals: ExtractedMeal[] }
  | { ok: false; status: number; code: string; message: string };

export interface AiProvider {
  extractMealPlanFromPdf(pdfBase64: string, prompt: string): Promise<AiResult>;
  generateMealPlan(prompt: string): Promise<AiResult>;
}

export function missingApiKeyResult(envVar: string, hint: string): AiResult {
  return {
    ok: false,
    status: 501,
    code: "missing_api_key",
    message: `Funzione AI non configurata: aggiungi ${envVar} alle variabili d'ambiente (${hint}).`,
  };
}

export function truncatedResult(): AiResult {
  return {
    ok: false,
    status: 502,
    code: "ai_truncated",
    message:
      "La risposta dell'AI è stata interrotta prima di completarsi, probabilmente perché il PDF contiene troppi alimenti per un'unica richiesta. Prova con un PDF più corto o suddiviso in più file.",
  };
}

export function aiErrorResult(error: unknown, fallback: string): AiResult {
  return {
    ok: false,
    status: 502,
    code: "ai_error",
    message: error instanceof Error ? error.message : fallback,
  };
}
