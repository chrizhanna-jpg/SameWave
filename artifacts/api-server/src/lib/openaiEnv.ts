/**
 * Prefer standard OpenAI env names; fall back to legacy AI_INTEGRATIONS_* (Replit) names.
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
