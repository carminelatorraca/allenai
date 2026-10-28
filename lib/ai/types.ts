import type { ExtractedMeal } from "@/lib/meal-plan-schema";
import type { GeneratedWorkoutDay } from "@/lib/workout-plan-schema";
import type { MealAlternativeDraft } from "@/lib/meal-alternatives-schema";

export type AiProviderName = "gemini" | "claude" | "openai";

export type AiFailure = { ok: false; status: number; code: string; message: string };

export type AiResult = { ok: true; meals: ExtractedMeal[] } | AiFailure;

export type AiWorkoutResult = { ok: true; days: GeneratedWorkoutDay[] } | AiFailure;

export type AiMealAlternativesResult =
  | { ok: true; alternatives: MealAlternativeDraft[] }
  | AiFailure;

export interface AiProvider {
  extractMealPlanFromPdf(pdfBase64: string, prompt: string): Promise<AiResult>;
  generateMealPlan(prompt: string): Promise<AiResult>;
  generateWorkoutPlan(prompt: string): Promise<AiWorkoutResult>;
  generateMealAlternatives(prompt: string): Promise<AiMealAlternativesResult>;
}

export function missingApiKeyFailure(envVar: string, hint: string): AiFailure {
  return {
    ok: false,
    status: 501,
    code: "missing_api_key",
    message: `Funzione AI non configurata: aggiungi ${envVar} alle variabili d'ambiente (${hint}).`,
  };
}

export function missingApiKeyResult(envVar: string, hint: string): AiResult {
  return missingApiKeyFailure(envVar, hint);
}

export function truncatedFailure(
  message = "La risposta dell'AI è stata interrotta prima di completarsi. Riprova, eventualmente con una richiesta più semplice.",
): AiFailure {
  return { ok: false, status: 502, code: "ai_truncated", message };
}

export function truncatedResult(): AiResult {
  return truncatedFailure(
    "La risposta dell'AI è stata interrotta prima di completarsi, probabilmente perché il PDF contiene troppi alimenti per un'unica richiesta. Prova con un PDF più corto o suddiviso in più file.",
  );
}

export function aiErrorFailure(error: unknown, fallback: string): AiFailure {
  return {
    ok: false,
    status: 502,
    code: "ai_error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export function aiErrorResult(error: unknown, fallback: string): AiResult {
  return aiErrorFailure(error, fallback);
}
