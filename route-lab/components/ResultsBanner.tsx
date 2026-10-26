"use client";

import type { Recommendations } from "@/lib/recommendations";
import { formatCost, formatTime } from "@/lib/recommendations";

interface Props {
  recommendations: Recommendations | null;
}

export default function ResultsBanner({ recommendations }: Props) {
  if (!recommendations) return null;

  const badges = [
    { label: "Best Quality", result: recommendations.bestQuality, color: "bg-purple-600/20 border-purple-500/40 text-purple-300" },
    { label: "Cheapest", result: recommendations.cheapest, color: "bg-emerald-600/20 border-emerald-500/40 text-emerald-300" },
    { label: "Fastest", result: recommendations.fastest, color: "bg-blue-600/20 border-blue-500/40 text-blue-300" },
    { label: "Best Value", result: recommendations.bestValue, color: "bg-amber-600/20 border-amber-500/40 text-amber-300" },
  ];

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-100">
          <span className="text-yellow-400">\/</span> Recommendations
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
        {badges.map((b) => (
          <div
            key={b.label}
            className={`rounded-lg border p-3 ${b.color}`}
          >
            <p className="text-xs font-medium uppercase tracking-wider opacity-70">{b.label}</p>
            <p className="text-sm font-semibold mt-1">{b.result.modelName}</p>
            <div className="flex items-center gap-3 mt-2 text-xs opacity-80">
              {b.result.scores && <span>Score: {b.result.scores.overall}/10</span>}
              <span>{formatCost(b.result.totalCost)}</span>
              <span>{formatTime(b.result.totalTime)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}