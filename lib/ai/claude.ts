import Anthropic from "@anthropic-ai/sdk";
import { MEAL_PLAN_SCHEMA, type ExtractedMeal } from "@/lib/meal-plan-schema";
import {
  aiErrorResult,
  missingApiKeyResult,
  truncatedResult,
  type AiProvider,
  type AiResult,
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
};
