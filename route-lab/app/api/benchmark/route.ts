import { NextRequest } from "next/server";
import { getModelById, type ModelConfig } from "@/config/models";
import { calculateCost } from "@/lib/cost";
import { getMockResponse, getMockTokens } from "@/lib/mock";

const MOCK_MODE = process.env.MOCK_MODE === "true";
const MAX_PROMPT_LENGTH = 4000;
const SAFETY_MAX_TOKENS = 4096;
const UPSTREAM_TIMEOUT_MS = 60_000;

// Simple in-memory rate limiter (per IP)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Drop expired entries so the map can't grow forever
  if (rateMap.size > 500) {
    for (const [key, entry] of rateMap) {
      if (now > entry.resetAt) rateMap.delete(key);
    }
  }

  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Turn raw provider errors into messages a person can act on
function describeApiError(status: number, text: string): string {
  if (status === 401 || status === 403) {
    return "Key rejected. Check the API key for this provider in your .env file.";
  }
  if (status === 402) {
    return "This provider needs credits for this model. Try a free model instead.";
  }
  if (status === 404) {
    // The provider's own text says why (bad model ID, or a data-policy setting)
    return `Model not available: ${text.slice(0, 160)}`;
  }
  if (status === 429) {
    return "This model is busy or hit its free limit. Try again in a minute or pick another model.";
  }
  return `API error (${status}): ${text.slice(0, 200)}`;
}

// One automatic retry on a 429, waiting a few seconds first
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 1,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && retries > 0) {
    const headerWait = Number(res.headers.get("retry-after")) * 1000;
    const wait = Math.min(headerWait || 2000, 5000);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithRetry(url, init, retries - 1);
  }
  return res;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
  }

  let body: { prompt: string; modelIds: string[]; userKeys?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { prompt, userKeys } = body;
  const modelIds = Array.isArray(body.modelIds)
    ? Array.from(new Set(body.modelIds))
    : body.modelIds;

  if (!prompt || typeof prompt !== "string") {
    return json({ error: "prompt is required" }, 400);
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(
      { error: `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.` },
      400,
    );
  }

  if (!Array.isArray(modelIds) || modelIds.length < 2 || modelIds.length > 4) {
    return json({ error: "Select between 2 and 4 models." }, 400);
  }

  const models: (ModelConfig | undefined)[] = modelIds.map(getModelById);
  if (models.some((m) => !m)) {
    return json({ error: "One or more model IDs are invalid." }, 400);
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (!closed) {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        }
      };

      const promises = (models as ModelConfig[]).map(async (model) => {
        const modelId = model.id;
        const startTime = Date.now();
        let ttft = 0;
        let firstToken = true;
        let fullResponse = "";

        try {
          if (MOCK_MODE) {
            const mockText = getMockResponse(model, prompt);
            const { inputTokens, outputTokens } = getMockTokens(model, prompt);

            const chars = mockText.split("");
            const chunkSize = 5;
            for (let i = 0; i < chars.length; i += chunkSize) {
              if (closed) break;
              const chunk = chars.slice(i, i + chunkSize).join("");
              fullResponse += chunk;
              if (firstToken) {
                firstToken = false;
                ttft = Date.now() - startTime;
              }
              send({ modelId, type: "chunk", content: chunk });
              await sleep(10 + Math.random() * 20);
            }

            const totalTime = Date.now() - startTime;
            const cost = calculateCost(model, inputTokens, outputTokens);

            send({
              modelId,
              type: "done",
              inputTokens,
              outputTokens,
              ttft,
              totalTime,
              totalCost: cost.totalCost,
              response: fullResponse,
            });
          } else {
            // Real API call
            const apiKey =
              userKeys?.[model.apiKeyEnv] ??
              userKeys?.[model.id] ??
              process.env[model.apiKeyEnv];
            if (!apiKey) {
              send({
                modelId,
                type: "error",
                error: `No API key configured for ${model.displayName}. Set ${model.apiKeyEnv} or provide a key.`,
              });
              return;
            }

            const response = await fetchWithRetry(
              `${model.baseURL}/chat/completions`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model: model.id,
                  messages: [{ role: "user", content: prompt }],
                  max_tokens: Math.min(model.maxTokens, SAFETY_MAX_TOKENS),
                  stream: true,
                  // Ask for real token counts in the final chunk.
                  // If a provider rejects this, delete the next line.
                  stream_options: { include_usage: true },
                }),
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
              },
            );

            if (!response.ok) {
              const errText = await response.text();
              send({
                modelId,
                type: "error",
                error: describeApiError(response.status, errText),
              });
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              send({ modelId, type: "error", error: "No response body from API." });
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let usage: { prompt_tokens?: number; completion_tokens?: number } = {};

            const handleLine = (line: string) => {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) return;
              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") return;

              try {
                const parsed = JSON.parse(data);
                if (parsed.usage) usage = parsed.usage;
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  if (firstToken) {
                    firstToken = false;
                    ttft = Date.now() - startTime;
                  }
                  send({ modelId, type: "chunk", content });
                }
              } catch {
                // skip malformed SSE lines
              }
            };

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (closed) {
                reader.cancel();
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              lines.forEach(handleLine);
            }
            if (buffer) handleLine(buffer);

            if (!fullResponse) {
              send({
                modelId,
                type: "error",
                error:
                  "The model returned no text. It may have used its whole token budget thinking. Try a shorter prompt or another model.",
              });
              return;
            }

            const totalTime = Date.now() - startTime;
            const inputTokens = usage.prompt_tokens || Math.ceil(prompt.length / 4);
            const outputTokens =
              usage.completion_tokens || Math.ceil(fullResponse.length / 4);
            const cost = calculateCost(model, inputTokens, outputTokens);

            send({
              modelId,
              type: "done",
              inputTokens,
              outputTokens,
              ttft,
              totalTime,
              totalCost: cost.totalCost,
              response: fullResponse,
            });
          }
        } catch (err: unknown) {
          const isTimeout = err instanceof Error && err.name === "TimeoutError";
          const message = isTimeout
            ? "Timed out after 60 seconds."
            : err instanceof Error
              ? err.message
              : "Unknown error";
          send({ modelId, type: "error", error: `Streaming failed: ${message}` });
        }
      });

      await Promise.all(promises);
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}