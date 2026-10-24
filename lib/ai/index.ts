import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import type { AiProvider, AiProviderName } from "./types";

const PROVIDERS: Record<AiProviderName, AiProvider> = {
  gemini: geminiProvider,
  claude: claudeProvider,
  openai: openaiProvider,
};

export function getAiProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER?.trim().toLowerCase() ?? "gemini") as AiProviderName;
  return PROVIDERS[name] ?? PROVIDERS.gemini;
}

export type { AiProvider, AiProviderName, AiResult } from "./types";
