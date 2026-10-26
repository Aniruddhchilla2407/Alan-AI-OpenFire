import { NextRequest } from "next/server";
import { getModelById, getJudgeModel } from "@/config/models";
import { getMockScore } from "@/lib/mock";

const MOCK_MODE = process.env.MOCK_MODE === "true";

export async function POST(req: NextRequest) {
  let body: { prompt: string; responses: { modelId: string; response: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { prompt, responses } = body;

  if (!prompt || !Array.isArray(responses) || responses.length === 0) {
    return new Response(JSON.stringify({ error: "prompt and responses array are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scores: Record<
    string,
    { correctness: number; clarity: number; completeness: number; overall: number; reason: string }
  > = {};

  for (const entry of responses) {
    const model = getModelById(entry.modelId);

    if (MOCK_MODE && model) {
      const mock = getMockScore(model);
      scores[entry.modelId] = {
        ...mock,
        overall: Math.round(((mock.correctness + mock.clarity + mock.completeness) / 3) * 10) / 10,
        reason: `${model.displayName} produced a ${mock.correctness >= 8 ? "strong" : "decent"} response. ${
          mock.clarity >= 8 ? "Clear and well-structured." : ""
        } ${mock.completeness >= 8 ? "Covers the requirements well." : "Some areas could be expanded."}`.trim(),
      };
      continue;
    }

    const judgeModel = getJudgeModel();
    const apiKey = process.env[judgeModel.apiKeyEnv];

    if (!apiKey) {
      scores[entry.modelId] = {
        correctness: 5,
        clarity: 5,
        completeness: 5,
        overall: 5,
        reason: "Judge unavailable — no API key configured.",
      };
      continue;
    }

    try {
      const judgePrompt = `You are an expert evaluator. Score the following model response on a scale of 1-10 for each of these dimensions:

- **Correctness**: Is the answer factually correct and does it solve the problem?
- **Clarity**: Is the response well-structured, easy to understand, and well-formatted?
- **Completeness**: Does it fully address all aspects of the prompt?

User prompt: "${prompt.slice(0, 2000)}"

Model response: "${entry.response.slice(0, 4000)}"

Respond in JSON only: {"correctness": <number>, "clarity": <number>, "completeness": <number>, "reason": "<one-line explanation>"}`;

      const judgeRes = await fetch(`${judgeModel.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: judgeModel.id,
          messages: [{ role: "user", content: judgePrompt }],
          max_tokens: 300,
          temperature: 0,
        }),
      });

      if (!judgeRes.ok) {
        scores[entry.modelId] = {
          correctness: 5,
          clarity: 5,
          completeness: 5,
          overall: 5,
          reason: `Judge API error (${judgeRes.status}).`,
        };
        continue;
      }

      const data = await judgeRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const avg = Math.round(
          ((parsed.correctness + parsed.clarity + parsed.completeness) / 3) * 10,
        ) / 10;
        scores[entry.modelId] = {
          correctness: clampScore(parsed.correctness),
          clarity: clampScore(parsed.clarity),
          completeness: clampScore(parsed.completeness),
          overall: avg,
          reason: parsed.reason ?? "No reason provided.",
        };
      } else {
        scores[entry.modelId] = {
          correctness: 5,
          clarity: 5,
          completeness: 5,
          overall: 5,
          reason: "Could not parse judge score.",
        };
      }
    } catch {
      scores[entry.modelId] = {
        correctness: 5,
        clarity: 5,
        completeness: 5,
        overall: 5,
        reason: "Judge call failed.",
      };
    }
  }

  return new Response(JSON.stringify({ scores }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function clampScore(score: number): number {
  if (typeof score !== "number" || isNaN(score)) return 5;
  return Math.max(1, Math.min(10, Math.round(score)));
}