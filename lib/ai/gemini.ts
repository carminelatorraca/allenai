import { GoogleGenAI } from "@google/genai";
import { MEAL_PLAN_SCHEMA, type ExtractedMeal } from "@/lib/meal-plan-schema";
import { WORKOUT_PLAN_SCHEMA, type GeneratedWorkoutDay } from "@/lib/workout-plan-schema";
import { MEAL_ALTERNATIVES_SCHEMA, type MealAlternativeDraft } from "@/lib/meal-alternatives-schema";
import {
  aiErrorFailure,
  aiErrorResult,
  missingApiKeyFailure,
  missingApiKeyResult,
  truncatedFailure,
  truncatedResult,
  type AiMealAlternativesResult,
  type AiProvider,
  type AiResult,
  type AiWorkoutResult,
} from "./types";

// Alias che punta sempre all'ultimo modello Flash stabile di Google,
// per evitare che un ID fisso (es. gemini-2.5-flash) smetta di funzionare
// quando Google rilascia una nuova generazione.
const MODEL = process.env.GEMINI_MODEL || "models/gemini-3.6-flash";

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function runStructured(parts: Part[]): Promise<AiResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return missingApiKeyResult("GEMINI_API_KEY", "gratuita su aistudio.google.com");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: MEAL_PLAN_SCHEMA,
        maxOutputTokens: 24000,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      return truncatedResult();
    }

    const text = response.text;

    if (!text) {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI vuota." };
    }

    let parsed: { meals?: ExtractedMeal[] };
    try {
      parsed = JSON.parse(text) as { meals?: ExtractedMeal[] };
    } catch {
      return truncatedResult();
    }
    return { ok: true, meals: parsed.meals ?? [] };
  } catch (error) {
    return aiErrorResult(error, "Errore durante la chiamata a Gemini.");
  }
}

async function runStructuredWorkout(prompt: string): Promise<AiWorkoutResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("GEMINI_API_KEY", "gratuita su aistudio.google.com");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: WORKOUT_PLAN_SCHEMA,
        maxOutputTokens: 16000,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") return truncatedFailure();

    const text = response.text;
    if (!text) {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI vuota." };
    }

    let parsed: { days?: GeneratedWorkoutDay[] };
    try {
      parsed = JSON.parse(text) as { days?: GeneratedWorkoutDay[] };
    } catch {
      return truncatedFailure();
    }
    return { ok: true, days: parsed.days ?? [] };
  } catch (error) {
    return aiErrorFailure(error, "Errore durante la chiamata a Gemini.");
  }
}

async function runStructuredMealAlternatives(prompt: string): Promise<AiMealAlternativesResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("GEMINI_API_KEY", "gratuita su aistudio.google.com");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: MEAL_ALTERNATIVES_SCHEMA,
        maxOutputTokens: 8000,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") return truncatedFailure();

    const text = response.text;
    if (!text) {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI vuota." };
    }

    let parsed: { alternatives?: MealAlternativeDraft[] };
    try {
      parsed = JSON.parse(text) as { alternatives?: MealAlternativeDraft[] };
    } catch {
      return truncatedFailure();
    }
    return { ok: true, alternatives: parsed.alternatives ?? [] };
  } catch (error) {
    return aiErrorFailure(error, "Errore durante la chiamata a Gemini.");
  }
}

export const geminiProvider: AiProvider = {
  async extractMealPlanFromPdf(pdfBase64, prompt) {
    return runStructured([
      { text: prompt },
      { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
    ]);
  },

  async generateMealPlan(prompt) {
    return runStructured([{ text: prompt }]);
  },

  async generateWorkoutPlan(prompt) {
    return runStructuredWorkout(prompt);
  },

  async generateMealAlternatives(prompt) {
    return runStructuredMealAlternatives(prompt);
  },
};
