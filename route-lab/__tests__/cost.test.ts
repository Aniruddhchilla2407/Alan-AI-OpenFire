import { describe, it, expect } from "vitest";
import { calculateCost, formatCost } from "@/lib/cost";
import { getModelById } from "@/config/models";

describe("calculateCost", () => {
  it("computes cost correctly for input and output tokens", () => {
    const model = getModelById("deepseek-chat")!;
    // DeepSeek Chat: $0.27/1M input, $1.10/1M output
    const result = calculateCost(model, 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(0.27);
    expect(result.outputCost).toBe(1.10);
    expect(result.totalCost).toBe(1.37);
  });

  it("handles zero tokens", () => {
    const model = getModelById("deepseek-chat")!;
    const result = calculateCost(model, 0, 0);
    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("handles fractional token counts", () => {
    const model = getModelById("qwen/qwen2.5-72b-instruct")!;
    // $0.23/1M input, $0.40/1M output
    const result = calculateCost(model, 500, 250);
    expect(result.totalCost).toBeCloseTo(0.000215, 6);
  });

  it("handles very large token counts", () => {
    const model = getModelById("deepseek-reasoner")!;
    // $0.55/1M input, $2.19/1M output
    const result = calculateCost(model, 10_000_000, 5_000_000);
    expect(result.inputCost).toBe(5.50);
    expect(result.outputCost).toBe(10.95);
    expect(result.totalCost).toBe(16.45);
  });
});

describe("formatCost", () => {
  it("formats costs under $0.0001", () => {
    expect(formatCost(0.00005)).toBe("<$0.0001");
  });

  it("formats small costs with 4 decimal places", () => {
    expect(formatCost(0.005)).toBe("$0.0050");
    expect(formatCost(0.0005)).toBe("$0.0005");
  });

  it("formats larger costs with 2 decimal places", () => {
    expect(formatCost(0.27)).toBe("$0.27");
    expect(formatCost(1.10)).toBe("$1.10");
  });
});