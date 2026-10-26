"use client";

import { useRef, useEffect } from "react";
import type { ModelConfig } from "@/config/models";
import { formatCost, formatTime } from "@/lib/recommendations";

export interface CardState {
  modelId: string;
  modelName: string;
  streaming: boolean;
  response: string;
  done: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  ttft?: number;
  totalTime?: number;
  totalCost?: number;
  scores?: {
    correctness: number;
    clarity: number;
    completeness: number;
    overall: number;
    reason: string;
  };
}

interface Props {
  state: CardState;
  model: ModelConfig;
}

export default function BenchmarkCard({ state, model }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && state.streaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.response, state.streaming]);

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col min-h-[300px] ${
        state.error
          ? "border-red-800 bg-red-950/20"
          : state.done
          ? "border-zinc-700 bg-zinc-900/60"
          : "border-zinc-700 bg-zinc-900/40"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              state.error
                ? "bg-red-500"
                : state.done
                ? "bg-emerald-500"
                : state.streaming
                ? "bg-blue-500 animate-pulse"
                : "bg-zinc-600"
            }`}
          />
          <h3 className="text-sm font-semibold text-zinc-200">{model.displayName}</h3>
        </div>
        <span className="text-xs text-zinc-500">{model.provider}</span>
      </div>

      {/* Content area */}
      <div
        ref={scrollRef}
        className="flex-1 px-4 py-3 streaming-card overflow-y-auto max-h-[400px]"
      >
        {state.error ? (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-lg p-3">
            <p className="font-medium mb-1">Error</p>
            <p>{state.error}</p>
          </div>
        ) : !state.streaming && !state.done ? (
          <Skeleton />
        ) : state.response ? (
          <div className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono">
            {state.response}
            {state.streaming && (
              <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        ) : (
          <Skeleton />
        )}
      </div>

      {/* Footer: metrics */}
      <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/80">
        {state.done && !state.error ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                TTFT: <span className="text-zinc-200 font-mono">{formatTime(state.ttft ?? 0)}</span>
              </span>
              <span>
                Total: <span className="text-zinc-200 font-mono">{formatTime(state.totalTime ?? 0)}</span>
              </span>
              <span>
                Tokens:{" "}
                <span className="text-zinc-200 font-mono">
                  {(state.inputTokens ?? 0)} → {(state.outputTokens ?? 0)}
                </span>
              </span>
              <span>
                Cost:{" "}
                <span className="text-emerald-400 font-mono font-semibold">
                  {formatCost(state.totalCost ?? 0)}
                </span>
              </span>
            </div>
            {state.scores && (
              <div className="flex items-center gap-3 text-xs">
                <ScoreBadge label="Quality" value={state.scores.overall} />
                <span className="text-zinc-500" title={state.scores.reason}>
                  {state.scores.reason}
                </span>
              </div>
            )}
          </div>
        ) : state.streaming ? (
          <p className="text-xs text-zinc-500 animate-pulse">Streaming response...</p>
        ) : state.error ? null : (
          <p className="text-xs text-zinc-600">Waiting...</p>
        )}
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  const color =
    value >= 8 ? "text-emerald-400 bg-emerald-950/40" : value >= 6 ? "text-yellow-400 bg-yellow-950/40" : "text-red-400 bg-red-950/40";
  return (
    <span className={`px-2 py-0.5 rounded-md font-mono font-semibold ${color}`}>
      {label}: {value}/10
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-skeleton">
      <div className="h-3 bg-zinc-800 rounded w-full" />
      <div className="h-3 bg-zinc-800 rounded w-5/6" />
      <div className="h-3 bg-zinc-800 rounded w-4/6" />
      <div className="h-3 bg-zinc-800 rounded w-3/6" />
      <div className="mt-3 h-10 bg-zinc-800/60 rounded-lg w-full" />
      <div className="h-3 bg-zinc-800 rounded w-5/6" />
      <div className="h-3 bg-zinc-800 rounded w-2/6" />
    </div>
  );
}