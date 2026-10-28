import OpenAI from "openai";
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

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

async function runStructured(
  input: OpenAI.Responses.ResponseCreateParamsNonStreaming["input"],
): Promise<AiResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return missingApiKeyResult("OPENAI_API_KEY", "a pagamento, platform.openai.com");
  }

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: MODEL,
      input,
      max_output_tokens: 24000,
      text: {
        format: {
          type: "json_schema",
          name: "meal_plan",
          schema: MEAL_PLAN_SCHEMA,
          strict: true,
        },
      },
    });

    if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
      return truncatedResult();
    }

    const text = response.output_text;

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
    return aiErrorResult(error, "Errore durante la chiamata a OpenAI.");
  }
}

async function runStructuredWorkout(prompt: string): Promise<AiWorkoutResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("OPENAI_API_KEY", "a pagamento, platform.openai.com");
  }

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: MODEL,
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 16000,
      text: {
        format: {
          type: "json_schema",
          name: "workout_plan",
          schema: WORKOUT_PLAN_SCHEMA,
          strict: true,
        },
      },
    });

    if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
      return truncatedFailure();
    }

    const text = response.output_text;
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
    return aiErrorFailure(error, "Errore durante la chiamata a OpenAI.");
  }
}

async function runStructuredMealAlternatives(prompt: string): Promise<AiMealAlternativesResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return missingApiKeyFailure("OPENAI_API_KEY", "a pagamento, platform.openai.com");
  }

  try {
    const client = new OpenAI({ apiKey });

    const response = await client.responses.create({
      model: MODEL,
      input: [{ role: "user", content: prompt }],
      max_output_tokens: 8000,
      text: {
        format: {
          type: "json_schema",
          name: "meal_alternatives",
          schema: MEAL_ALTERNATIVES_SCHEMA,
          strict: true,
        },
      },
    });

    if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
      return truncatedFailure();
    }

    const text = response.output_text;
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
    return aiErrorFailure(error, "Errore durante la chiamata a OpenAI.");
  }
}

export const openaiProvider: AiProvider = {
  async extractMealPlanFromPdf(pdfBase64, prompt) {
    return runStructured([
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename: "piano.pdf",
            file_data: `data:application/pdf;base64,${pdfBase64}`,
          },
          { type: "input_text", text: prompt },
        ],
      },
    ]);
  },

  async generateMealPlan(prompt) {
    return runStructured([{ role: "user", content: prompt }]);
  },

  async generateWorkoutPlan(prompt) {
    return runStructuredWorkout(prompt);
  },

  async generateMealAlternatives(prompt) {
    return runStructuredMealAlternatives(prompt);
  },
};
