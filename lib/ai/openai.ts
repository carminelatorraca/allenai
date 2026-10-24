import OpenAI from "openai";
import { MEAL_PLAN_SCHEMA, type ExtractedMeal } from "@/lib/meal-plan-schema";
import {
  aiErrorResult,
  missingApiKeyResult,
  truncatedResult,
  type AiProvider,
  type AiResult,
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
};
