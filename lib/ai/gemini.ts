import { GoogleGenAI } from "@google/genai";
import { MEAL_PLAN_SCHEMA, type ExtractedMeal } from "@/lib/meal-plan-schema";
import {
  aiErrorResult,
  missingApiKeyResult,
  truncatedResult,
  type AiProvider,
  type AiResult,
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
};
