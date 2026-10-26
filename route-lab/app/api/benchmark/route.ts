import { NextRequest } from "next/server";
import { getModelById, type ModelConfig } from "@/config/models";
import { calculateCost } from "@/lib/cost";
import { getMockResponse, getMockTokens } from "@/lib/mock";

const MOCK_MODE = process.env.MOCK_MODE === "true";
const MAX_PROMPT_LENGTH = 16384;
const SAFETY_MAX_TOKENS = 8192;

// Simple in-memory rate limiter (per IP)
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { prompt: string; modelIds: string[]; userKeys?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, modelIds, userKeys } = body;

  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Prompt too long. Maximum ${MAX_PROMPT_LENGTH} characters.` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!Array.isArray(modelIds) || modelIds.length < 2 || modelIds.length > 4) {
    return new Response(
      JSON.stringify({ error: "Select between 2 and 4 models." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const models: (ModelConfig | undefined)[] = modelIds.map(getModelById);
  if (models.some((m) => !m)) {
    return new Response(JSON.stringify({ error: "One or more model IDs are invalid." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create a stream for each model
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
        let error: string | undefined;

        try {
          if (MOCK_MODE) {
            // Mock mode: simulate streaming
            const mockText = getMockResponse(model, prompt);
            const { inputTokens, outputTokens } = getMockTokens(model, prompt);

            // Simulate streaming character by character with small delays
            const chars = mockText.split("");
            const chunkSize = 5; // chars per chunk
            for (let i = 0; i < chars.length; i += chunkSize) {
              if (closed) break;
              const chunk = chars.slice(i, i + chunkSize).join("");
              fullResponse += chunk;
              if (firstToken) {
                firstToken = false;
                ttft = Date.now() - startTime;
              }
              send({
                modelId,
                type: "chunk",
                content: chunk,
              });
              await sleep(10 + Math.random() * 20); // 10-30ms delay
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
            const apiKey = userKeys?.[model.id] ?? process.env[model.apiKeyEnv];
            if (!apiKey) {
              error = `No API key configured for ${model.displayName}. Set ${model.apiKeyEnv} or provide a key.`;
              send({ modelId, type: "error", error });
              return;
            }

            const response = await fetch(`${model.baseURL}/chat/completions`, {
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
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              error = `API error (${response.status}): ${errText.slice(0, 200)}`;
              send({ modelId, type: "error", error });
              return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
              error = "No response body from API.";
              send({ modelId, type: "error", error });
              return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

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

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data: ")) continue;
                const data = trimmed.slice(6);
                if (data === "[DONE]") continue;

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullResponse += content;
                    if (firstToken) {
                      firstToken = false;
                      ttft = Date.now() - startTime;
                    }
                    send({
                      modelId,
                      type: "chunk",
                      content,
                    });
                  }
                } catch {
                  // skip malformed SSE lines
                }
              }
            }

            const totalTime = Date.now() - startTime;

            // Estimate tokens from usage if available, otherwise approximate
            const usage = { prompt_tokens: 0, completion_tokens: 0 };
            // Some APIs include usage in the last chunk — approximate if not
            const inputTokens = usage.prompt_tokens || Math.ceil(prompt.length / 4);
            const outputTokens = usage.completion_tokens || Math.ceil(fullResponse.length / 4);
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
          const message = err instanceof Error ? err.message : "Unknown error";
          error = `Streaming failed: ${message}`;
          send({ modelId, type: "error", error });
        }
      });

      await Promise.all(promises);
      controller.close();
      closed = true;
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