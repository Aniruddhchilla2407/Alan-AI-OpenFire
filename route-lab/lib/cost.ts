import type { ModelConfig } from "@/config/models";

export interface CostResult {
  inputCost: number; // USD
  outputCost: number; // USD
  totalCost: number; // USD
}

export function calculateCost(
  model: ModelConfig,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  const inputCost = (inputTokens / 1_000_000) * model.pricePer1MInput;
  const outputCost = (outputTokens / 1_000_000) * model.pricePer1MOutput;
  const totalCost = inputCost + outputCost;

  return {
    inputCost: roundUSD(inputCost),
    outputCost: roundUSD(outputCost),
    totalCost: roundUSD(totalCost),
  };
}

export function formatCost(amount: number): string {
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function roundUSD(amount: number): number {
  return Math.round(amount * 1_000_000) / 1_000_000;
}