import { describe, it, expect } from "vitest";
import { computeRecommendations, formatTime, type ModelResult } from "@/lib/recommendations";

function makeResult(overrides: Partial<ModelResult>): ModelResult {
  return {
    modelId: "test-model",
    modelName: "Test Model",
    response: "test",
    inputTokens: 100,
    outputTokens: 200,
    ttft: 500,
    totalTime: 3000,
    totalCost: 0.001,
    ...overrides,
  };
}

describe("computeRecommendations", () => {
  it("returns null for empty results", () => {
    expect(computeRecommendations([])).toBeNull();
  });

  it("returns null when all results have errors", () => {
    expect(
      computeRecommendations([
        makeResult({ modelId: "a", error: "fail" }),
        makeResult({ modelId: "b", error: "fail" }),
      ]),
    ).toBeNull();
  });

  it("picks best quality based on overall score", () => {
    const results = [
      makeResult({
        modelId: "a",
        modelName: "Model A",
        scores: { correctness: 9, clarity: 9, completeness: 9, overall: 9, reason: "great" },
      }),
      makeResult({
        modelId: "b",
        modelName: "Model B",
        scores: { correctness: 5, clarity: 5, completeness: 5, overall: 5, reason: "ok" },
      }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    expect(recs!.bestQuality.modelId).toBe("a");
  });

  it("picks cheapest based on total cost", () => {
    const results = [
      makeResult({ modelId: "a", modelName: "Expensive", totalCost: 0.01 }),
      makeResult({ modelId: "b", modelName: "Cheap", totalCost: 0.0001 }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    expect(recs!.cheapest.modelId).toBe("b");
  });

  it("picks fastest based on total time", () => {
    const results = [
      makeResult({ modelId: "a", modelName: "Slow", totalTime: 10000 }),
      makeResult({ modelId: "b", modelName: "Fast", totalTime: 500 }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    expect(recs!.fastest.modelId).toBe("b");
  });

  it("picks best value (quality per dollar)", () => {
    const results = [
      makeResult({
        modelId: "a",
        modelName: "Good but costly",
        totalCost: 1.0,
        scores: { correctness: 9, clarity: 9, completeness: 9, overall: 9, reason: "good" },
      }),
      makeResult({
        modelId: "b",
        modelName: "Decent and cheap",
        totalCost: 0.001,
        scores: { correctness: 7, clarity: 7, completeness: 7, overall: 7, reason: "decent" },
      }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    // Model B has 7/0.00101 = ~6930, Model A has 9/1.0001 = ~9
    expect(recs!.bestValue.modelId).toBe("b");
  });

  it("handles results without scores", () => {
    const results = [
      makeResult({ modelId: "a", totalCost: 0.01 }),
      makeResult({ modelId: "b", totalCost: 0.02 }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    expect(recs!.cheapest.modelId).toBe("a");
    expect(recs!.bestQuality.modelId).toBeDefined(); // falls back to 0 scores
  });

  it("skips errored results in recommendations", () => {
    const results = [
      makeResult({ modelId: "a", error: "failed" }),
      makeResult({ modelId: "b", totalCost: 0.001, totalTime: 1000 }),
    ];
    const recs = computeRecommendations(results);
    expect(recs).not.toBeNull();
    expect(recs!.bestQuality.modelId).toBe("b");
    expect(recs!.cheapest.modelId).toBe("b");
  });
});

describe("formatTime", () => {
  it("formats milliseconds under 1000", () => {
    expect(formatTime(500)).toBe("500ms");
    expect(formatTime(0)).toBe("0ms");
    expect(formatTime(999)).toBe("999ms");
  });

  it("formats seconds with one decimal", () => {
    expect(formatTime(1000)).toBe("1.0s");
    expect(formatTime(3500)).toBe("3.5s");
    expect(formatTime(10000)).toBe("10.0s");
  });
});