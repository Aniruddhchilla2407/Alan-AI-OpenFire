// RouteLab model configuration
// To add a new model: add an entry below with id, display name, base URL, env var for API key, and pricing.
// Then add the corresponding env var to .env.example and your environment.

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: string;
  baseURL: string; // OpenAI-compatible endpoint
  apiKeyEnv: string; // env variable name for the API key
  pricePer1MInput: number; // USD per 1M input tokens
  pricePer1MOutput: number; // USD per 1M output tokens
  maxTokens: number; // safety cap per request
}

export const MODELS: ModelConfig[] = [
  {
    id: "deepseek-chat",
    displayName: "DeepSeek V3",
    provider: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    pricePer1MInput: 0.27,
    pricePer1MOutput: 1.10,
    maxTokens: 8192,
  },
  {
    id: "deepseek-reasoner",
    displayName: "DeepSeek R1",
    provider: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    pricePer1MInput: 0.55,
    pricePer1MOutput: 2.19,
    maxTokens: 8192,
  },
  {
    id: "qwen/qwen2.5-72b-instruct",
    displayName: "Qwen 2.5 72B",
    provider: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.23,
    pricePer1MOutput: 0.40,
    maxTokens: 8192,
  },
  {
    id: "qwen/qwq-32b",
    displayName: "QWQ 32B (Reasoning)",
    provider: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.20,
    pricePer1MOutput: 0.30,
    maxTokens: 8192,
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    displayName: "Nemotron 70B",
    provider: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    pricePer1MInput: 0.35,
    pricePer1MOutput: 0.40,
    maxTokens: 8192,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B",
    provider: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.23,
    pricePer1MOutput: 0.40,
    maxTokens: 8192,
  },
  {
    id: "google/gemini-2.0-flash-001",
    displayName: "Gemini 2.0 Flash",
    provider: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.10,
    pricePer1MOutput: 0.40,
    maxTokens: 8192,
  },
  {
    id: "anthropic/claude-3.5-haiku",
    displayName: "Claude 3.5 Haiku",
    provider: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    pricePer1MInput: 0.80,
    pricePer1MOutput: 4.00,
    maxTokens: 8192,
  },
];

export function getModelById(id: string): ModelConfig | undefined {
  return MODELS.find((m) => m.id === id);
}

// The "cheap" judge model - use for scoring
export function getJudgeModel(): ModelConfig {
  return MODELS.find((m) => m.id === "google/gemini-2.0-flash-001") ?? MODELS[0];
}