import OpenAI from "openai";

/**
 * Prefer standard OpenAI env names; fall back to legacy AI_INTEGRATIONS_* names.
 */

export function getOpenAIEnv(): {
  apiKey: string;
  baseURL: string | undefined;
} {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ??
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() ??
    "";

  const baseURL =
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() ||
    undefined;

  return { apiKey, baseURL };
}

/** Build a client from current `process.env` (not cached at module load). */
export function createOpenAIClient(): OpenAI | null {
  const { apiKey, baseURL } = getOpenAIEnv();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}
