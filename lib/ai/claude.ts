import Anthropic from "@anthropic-ai/sdk";
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

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

async function runStructured(content: Anthropic.MessageParam["content"]): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return missingApiKeyResult("ANTHROPIC_API_KEY", "a pagamento, console.anthropic.com");
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 24000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: MEAL_PLAN_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 502,
        code: "ai_refusal",
        message: "L'AI non è riuscita a elaborare questa richiesta.",
      };
    }

    if (response.stop_reason === "max_tokens") {
      return truncatedResult();
    }

    const textBlock = response.content.find((block) => block.type === "text");

    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI priva di contenuto testuale." };
    }

    let parsed: { meals?: ExtractedMeal[] };
    try {
      parsed = JSON.parse(textBlock.text) as { meals?: ExtractedMeal[] };
    } catch {
      return truncatedResult();
    }
    return { ok: true, meals: parsed.meals ?? [] };
  } catch (error) {
    return aiErrorResult(error, "Errore durante la chiamata a Claude.");
  }
}

async function runStructuredWorkout(prompt: string): Promise<AiWorkoutResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("ANTHROPIC_API_KEY", "a pagamento, console.anthropic.com");
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: WORKOUT_PLAN_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 502,
        code: "ai_refusal",
        message: "L'AI non è riuscita a elaborare questa richiesta.",
      };
    }

    if (response.stop_reason === "max_tokens") return truncatedFailure();

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI priva di contenuto testuale." };
    }

    let parsed: { days?: GeneratedWorkoutDay[] };
    try {
      parsed = JSON.parse(textBlock.text) as { days?: GeneratedWorkoutDay[] };
    } catch {
      return truncatedFailure();
    }
    return { ok: true, days: parsed.days ?? [] };
  } catch (error) {
    return aiErrorFailure(error, "Errore durante la chiamata a Claude.");
  }
}

async function runStructuredMealAlternatives(prompt: string): Promise<AiMealAlternativesResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("ANTHROPIC_API_KEY", "a pagamento, console.anthropic.com");
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: MEAL_ALTERNATIVES_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        status: 502,
        code: "ai_refusal",
        message: "L'AI non è riuscita a elaborare questa richiesta.",
      };
    }

    if (response.stop_reason === "max_tokens") return truncatedFailure();

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { ok: false, status: 502, code: "ai_error", message: "Risposta AI priva di contenuto testuale." };
    }

    let parsed: { alternatives?: MealAlternativeDraft[] };
    try {
      parsed = JSON.parse(textBlock.text) as { alternatives?: MealAlternativeDraft[] };
    } catch {
      return truncatedFailure();
    }
    return { ok: true, alternatives: parsed.alternatives ?? [] };
  } catch (error) {
    return aiErrorFailure(error, "Errore durante la chiamata a Claude.");
  }
}

export const claudeProvider: AiProvider = {
  async extractMealPlanFromPdf(pdfBase64, prompt) {
    return runStructured([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      },
      { type: "text", text: prompt },
    ]);
  },

  async generateMealPlan(prompt) {
    return runStructured(prompt);
  },

  async generateWorkoutPlan(prompt) {
    return runStructuredWorkout(prompt);
  },

  async generateMealAlternatives(prompt) {
    return runStructuredMealAlternatives(prompt);
  },
};
