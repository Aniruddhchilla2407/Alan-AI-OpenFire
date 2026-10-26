// RouteLab model configuration (free tiers: Groq + OpenRouter)
// Both providers are OpenAI-compatible. To add a model, add an entry below.
//
// Prices are USD per 1M tokens at LIST price. Free-tier calls cost $0, but we
// keep list prices so the cost comparison stays meaningful.
// Entries marked PLACEHOLDER need real numbers: run the price command from
// the chat and paste the results here.

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: string; // used to group models in the UI
  baseURL: string; // OpenAI-compatible endpoint
  apiKeyEnv: string; // env variable name for the API key
  pricePer1MInput: number;
  pricePer1MOutput: number;
  maxTokens: number; // safety cap per request
  reasoning?: boolean; // thinks first: slower and costlier than the table suggests
}

const GROQ_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_URL = "https://openrouter.ai/api/v1";

export const MODELS: ModelConfig[] = [
  // --- Groq (free tier) ---
  {
    id: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    provider: "Groq",
    baseURL: GROQ_URL,
    apiKeyEnv: "GROQ_API_KEY",
    pricePer1MInput: 0.15, // VERIFY list price
    pricePer1MOutput: 0.6, // VERIFY list price
    maxTokens: 4096,
    reasoning: true,
  },
  {
    id: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    provider: "Groq",
    baseURL: GROQ_URL,
    apiKeyEnv: "GROQ_API_KEY",
    pricePer1MInput: 0.075, // VERIFY list price
    pricePer1MOutput: 0.3, // VERIFY list price
    maxTokens: 4096,
    reasoning: true,
  },

  // --- OpenRouter (free models; the list rotates, so re-check now and then) ---
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    displayName: "Nemotron 3 Super 120B",
    provider: "Nvidia",
    baseURL: OPENROUTER_URL,
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.1, // PLACEHOLDER
    pricePer1MOutput: 0.4, // PLACEHOLDER
    maxTokens: 4096, // may think before answering
    reasoning: true,
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    displayName: "Nemotron 3 Ultra 550B",
    provider: "Nvidia",
    baseURL: OPENROUTER_URL,
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.3, // PLACEHOLDER
    pricePer1MOutput: 1.2, // PLACEHOLDER
    maxTokens: 4096,
    reasoning: true,
  },
  {
    id: "google/gemma-4-31b-it:free",
    displayName: "Gemma 4 31B",
    provider: "Google",
    baseURL: OPENROUTER_URL,
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.1, // PLACEHOLDER
    pricePer1MOutput: 0.3, // PLACEHOLDER
    maxTokens: 2048,
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    displayName: "Gemma 4 26B (MoE)",
    provider: "Google",
    baseURL: OPENROUTER_URL,
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.06, // PLACEHOLDER
    pricePer1MOutput: 0.2, // PLACEHOLDER
    maxTokens: 2048,
  },
];

export function getModelById(id: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === id);
}

// The judge scores the other models' answers. It runs on Groq so it doesn't
// use up the small OpenRouter daily free limit.
const JUDGE_MODEL_ID = "openai/gpt-oss-20b";

export function getJudgeModel(): ModelConfig {
  return getModelById(JUDGE_MODEL_ID) ?? MODELS[0];
}