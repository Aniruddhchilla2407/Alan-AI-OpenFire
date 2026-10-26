
export { formatCost } from "./cost";


export interface ModelResult {
  modelId: string;
  modelName: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  ttft: number; // time to first token in ms
  totalTime: number; // total time in ms
  totalCost: number;
  error?: string;
  scores?: {
    correctness: number;
    clarity: number;
    completeness: number;
    overall: number;
    reason: string;
  };
}

export type Recommendation = "bestQuality" | "cheapest" | "fastest" | "bestValue";

export interface Recommendations {
  bestQuality: ModelResult;
  cheapest: ModelResult;
  fastest: ModelResult;
  bestValue: ModelResult;
}

export function computeRecommendations(results: ModelResult[]): Recommendations | null {
  const valid = results.filter((r) => !r.error);
  if (valid.length === 0) return null;

  // Best quality = highest overall score (falls back to no scores)
  const byQuality = [...valid].sort((a, b) => {
    const sa = a.scores?.overall ?? 0;
    const sb = b.scores?.overall ?? 0;
    return sb - sa;
  });

  // Cheapest
  const byCost = [...valid].sort((a, b) => a.totalCost - b.totalCost);

  // Fastest
  const byTime = [...valid].sort((a, b) => a.totalTime - b.totalTime);

  // Best value = highest (overall score / cost ratio)
  const byValue = [...valid].sort((a, b) => {
    const va = valueRatio(a);
    const vb = valueRatio(b);
    return vb - va;
  });

  return {
    bestQuality: byQuality[0],
    cheapest: byCost[0],
    fastest: byTime[0],
    bestValue: byValue[0],
  };
}

function valueRatio(r: ModelResult): number {
  const score = r.scores?.overall ?? 5;
  return score / (r.totalCost + 0.000001);
}
export function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}