"use client";

import { useState, useCallback, useRef } from "react";
import { MODELS, getModelById } from "@/config/models";
import type { ModelResult, Recommendations } from "@/lib/recommendations";
import { computeRecommendations } from "@/lib/recommendations";

import PromptInput from "@/components/PromptInput";
import ModelSelector from "@/components/ModelSelector";
import BenchmarkCard, { type CardState } from "@/components/BenchmarkCard";
import ResultsBanner from "@/components/ResultsBanner";
import BudgetTracker, { type BudgetTrackerHandle } from "@/components/BudgetTracker";
import ExportButton from "@/components/ExportButton";

const DEFAULT_PROMPT =
  "Write a Python function that generates the first N Fibonacci numbers.";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([
    "deepseek-chat",
    "qwen/qwen2.5-72b-instruct",
  ]);
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [judging, setJudging] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const budgetRef = useRef<BudgetTrackerHandle>(null);

  const isEmpty = !hasRun && !prompt;

  const handleRunExample = useCallback(() => {
    setPrompt(DEFAULT_PROMPT);
    setSelectedModels(["deepseek-chat", "qwen/qwen2.5-72b-instruct"]);
    // Run is triggered after a short delay to let state settle
    setTimeout(() => {
      runBenchmark(DEFAULT_PROMPT, ["deepseek-chat", "qwen/qwen2.5-72b-instruct"]);
    }, 100);
  }, []);

  const handleRun = useCallback(() => {
    if (isEmpty) {
      handleRunExample();
    } else {
      runBenchmark(prompt, selectedModels);
    }
  }, [prompt, selectedModels, isEmpty, handleRunExample]);

  const runBenchmark = async (taskPrompt: string, modelIds: string[]) => {
    if (running) return;

    // Initialize card states
    const initial: Map<string, CardState> = new Map();
    modelIds.forEach((id) => {
      const model = getModelById(id);
      initial.set(id, {
        modelId: id,
        modelName: model?.displayName ?? id,
        streaming: false,
        response: "",
        done: false,
      });
    });
    setCardStates(initial);
    setResults([]);
    setRecommendations(null);
    setRunning(true);
    setHasRun(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: taskPrompt, modelIds }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setCardStates((prev) => {
          const next = new Map(prev);
          modelIds.forEach((id) => {
            const state = next.get(id);
            if (state) {
              next.set(id, { ...state, error: err.error ?? "API error", streaming: false, done: true });
            }
          });
          return next;
        });
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const collected: ModelResult[] = [];

      // Collect one result per model
      modelIds.forEach((id) => {
        collected.push({
          modelId: id,
          modelName: getModelById(id)?.displayName ?? id,
          response: "",
          inputTokens: 0,
          outputTokens: 0,
          ttft: 0,
          totalTime: 0,
          totalCost: 0,
        });
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            setCardStates((prev) => {
              const next = new Map(prev);
              const state = next.get(data.modelId);
              if (!state) return next;

              switch (data.type) {
                case "chunk":
                  next.set(data.modelId, {
                    ...state,
                    streaming: true,
                    response: state.response + data.content,
                  });
                  break;
                case "done": {
                  const result = collected.find((r) => r.modelId === data.modelId);
                  if (result) {
                    result.inputTokens = data.inputTokens;
                    result.outputTokens = data.outputTokens;
                    result.ttft = data.ttft;
                    result.totalTime = data.totalTime;
                    result.totalCost = data.totalCost;
                    result.response = data.response;
                  }
                  // Budget tracking
                  budgetRef.current?.recordSpend(
                    data.totalCost,
                    data.modelId,
                    state.modelName,
                    taskPrompt,
                  );
                  next.set(data.modelId, {
                    ...state,
                    streaming: false,
                    done: true,
                    response: data.response,
                    inputTokens: data.inputTokens,
                    outputTokens: data.outputTokens,
                    ttft: data.ttft,
                    totalTime: data.totalTime,
                    totalCost: data.totalCost,
                  });
                  break;
                }
                case "error":
                  next.set(data.modelId, {
                    ...state,
                    streaming: false,
                    done: true,
                    error: data.error,
                  });
                  break;
              }
              return next;
            });
          } catch {
            // skip malformed lines
          }
        }
      }

      const valid = collected.filter((r) => r.response || r.error);
      setResults(valid);

      // Run LLM judge
      if (valid.some((r) => r.response)) {
        setJudging(true);
        try {
          const judgeRes = await fetch("/api/judge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: taskPrompt,
              responses: valid
                .filter((r) => r.response)
                .map((r) => ({ modelId: r.modelId, response: r.response })),
            }),
          });

          if (judgeRes.ok) {
            const { scores } = await judgeRes.json();

            // Update results with scores
            const withScores = valid.map((r) => ({
              ...r,
              scores: scores[r.modelId] ?? undefined,
            }));

            setResults(withScores);
            setCardStates((prev) => {
              const next = new Map(prev);
              for (const [modelId, score] of Object.entries(scores)) {
                const state = next.get(modelId);
                if (state) {
                  next.set(modelId, {
                    ...state,
                    scores: score as CardState["scores"],
                  });
                }
              }
              return next;
            });

            const recs = computeRecommendations(withScores);
            setRecommendations(recs);
          } else {
            const recs = computeRecommendations(valid);
            setRecommendations(recs);
          }
        } catch {
          const recs = computeRecommendations(valid);
          setRecommendations(recs);
        }
        setJudging(false);
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setCardStates((prev) => {
        const next = new Map(prev);
        modelIds.forEach((id) => {
          const state = next.get(id);
          if (state && !state.done) {
            next.set(id, {
              ...state,
              error: "Connection lost. Please try again.",
              streaming: false,
              done: true,
            });
          }
        });
        return next;
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-blue-400">Route</span>
          <span className="text-zinc-100">Lab</span>
        </h1>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto">
          Compare open-source LLMs side by side. Find the best model for your task —
          based on quality, speed, and cost.
        </p>
      </header>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <PromptInput
            prompt={prompt}
            onChange={setPrompt}
            onRun={handleRun}
            disabled={running}
            running={running}
            isEmpty={isEmpty}
          />
          <ModelSelector
            selected={selectedModels}
            onChange={setSelectedModels}
            disabled={running}
          />
        </div>
        <div className="lg:col-span-4">
          <BudgetTracker ref={budgetRef} />
        </div>
      </div>

      {/* Benchmark cards */}
      {cardStates.size > 0 && (
        <div
          className={`grid gap-4 ${
            cardStates.size === 2
              ? "grid-cols-1 md:grid-cols-2"
              : cardStates.size === 3
              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          {Array.from(cardStates.entries()).map(([modelId, state]) => {
            const model = getModelById(modelId);
            if (!model) return null;
            return <BenchmarkCard key={modelId} state={state} model={model} />;
          })}
        </div>
      )}

      {/* Judging indicator */}
      {judging && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-400">
          <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
          Scoring responses with LLM judge...
        </div>
      )}

      {/* Recommendations + Export */}
      {recommendations && (
        <div className="space-y-4">
          <ResultsBanner recommendations={recommendations} />
          <div className="flex justify-end">
            <ExportButton results={results} prompt={prompt} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-8 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">
          Built with Alan AI + open models &middot;{" "}
          <a
            href="https://github.com/Aniruddhchilla2407/Alan-AI-OpenFire"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}