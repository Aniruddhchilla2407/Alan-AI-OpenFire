"use client";

import { useState, useCallback, useRef } from "react";
import { getModelById } from "@/config/models";
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
const DEFAULT_MODELS = ["openai/gpt-oss-120b", "nvidia/nemotron-3-super-120b-a12b:free"];

interface StreamEvent {
  type: "chunk" | "done" | "error";
  modelId: string;
  content?: string;
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
  ttft?: number;
  totalTime?: number;
  totalCost?: number;
  error?: string;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [ranPrompt, setRanPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(DEFAULT_MODELS);
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [judging, setJudging] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const budgetRef = useRef<BudgetTrackerHandle>(null);

  const isEmpty = !hasRun && !prompt;

  const runBenchmark = useCallback(async (taskPrompt: string, requestedIds: string[]) => {
    if (runningRef.current) return;
    if (!taskPrompt.trim()) {
      setNotice("Enter a task prompt first.");
      return;
    }

    // Drop any ID that no longer exists in config/models.ts
    const modelIds = Array.from(new Set(requestedIds)).filter((id) =>
      getModelById(id),
    );
    if (modelIds.length < 2) {
      setNotice("Select at least 2 models to compare.");
      return;
    }

    setNotice("");
    runningRef.current = true;

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
    setRanPrompt(taskPrompt);
    setRunning(true);
    setHasRun(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Mark every card that hasn't finished as failed
    const failAll = (message: string) => {
      setCardStates((prev) => {
        const next = new Map(prev);
        modelIds.forEach((id) => {
          const s = next.get(id);
          if (s && !s.done) {
            next.set(id, { ...s, error: message, streaming: false, done: true });
          }
        });
        return next;
      });
    };

    // One result object per model, filled in as events arrive
    const collected: ModelResult[] = modelIds.map((id) => ({
      modelId: id,
      modelName: getModelById(id)?.displayName ?? id,
      response: "",
      inputTokens: 0,
      outputTokens: 0,
      ttft: 0,
      totalTime: 0,
      totalCost: 0,
    }));

    // Handles one line from the stream. Side effects (budget, collected)
    // happen here, OUTSIDE the state updater, so they run exactly once.
    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let data: StreamEvent;
      try {
        data = JSON.parse(line) as StreamEvent;
      } catch {
        return; // skip malformed lines
      }

      const result = collected.find((r) => r.modelId === data.modelId);
      if (!result) return;

      if (data.type === "done") {
        result.response = data.response ?? "";
        result.inputTokens = data.inputTokens ?? 0;
        result.outputTokens = data.outputTokens ?? 0;
        result.ttft = data.ttft ?? 0;
        result.totalTime = data.totalTime ?? 0;
        result.totalCost = data.totalCost ?? 0;
        budgetRef.current?.recordSpend(
          result.totalCost,
          result.modelId,
          result.modelName,
          taskPrompt,
        );
      } else if (data.type === "error") {
        result.error = data.error ?? "Unknown error";
      }

      // Pure updater: no side effects in here
      setCardStates((prev) => {
        const state = prev.get(data.modelId);
        if (!state) return prev;
        const next = new Map(prev);
        switch (data.type) {
          case "chunk":
            next.set(data.modelId, {
              ...state,
              streaming: true,
              response: state.response + (data.content ?? ""),
            });
            break;
          case "done":
            next.set(data.modelId, {
              ...state,
              streaming: false,
              done: true,
              response: data.response ?? state.response,
              inputTokens: data.inputTokens ?? 0,
              outputTokens: data.outputTokens ?? 0,
              ttft: data.ttft ?? 0,
              totalTime: data.totalTime ?? 0,
              totalCost: data.totalCost ?? 0,
            });
            break;
          case "error":
            next.set(data.modelId, {
              ...state,
              streaming: false,
              done: true,
              error: data.error ?? "Unknown error",
            });
            break;
        }
        return next;
      });
    };

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: taskPrompt, modelIds }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        failAll(err.error ?? "API error");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        failAll("No response stream from server.");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handleLine);
      }
      if (buffer.trim()) handleLine(buffer); // flush the last line

      // Any model that never finished gets an error instead of spinning forever
      failAll("No response received.");
      collected.forEach((r) => {
        if (!r.response && !r.error) r.error = "No response received.";
      });

      setResults(collected);

      // Run LLM judge
      if (collected.some((r) => r.response)) {
        setJudging(true);
        try {
          const judgeRes = await fetch("/api/judge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: taskPrompt,
              responses: collected
                .filter((r) => r.response)
                .map((r) => ({ modelId: r.modelId, response: r.response })),
            }),
            signal: controller.signal,
          });

          if (judgeRes.ok) {
            const { scores } = await judgeRes.json();

            const withScores = collected.map((r) => ({
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

            setRecommendations(computeRecommendations(withScores));
          } else {
            setRecommendations(computeRecommendations(collected));
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setRecommendations(computeRecommendations(collected));
        } finally {
          setJudging(false);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      failAll("Connection lost. Please try again.");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  const handleRunExample = useCallback(() => {
    setPrompt(DEFAULT_PROMPT);
    setSelectedModels(DEFAULT_MODELS);
    runBenchmark(DEFAULT_PROMPT, DEFAULT_MODELS);
  }, [runBenchmark]);

  const handleRun = useCallback(() => {
    if (isEmpty) {
      handleRunExample();
    } else {
      runBenchmark(prompt, selectedModels);
    }
  }, [prompt, selectedModels, isEmpty, handleRunExample, runBenchmark]);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <header className="text-center space-y-4 pt-8 pb-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Open models only
        </div>
        <h1 className="text-5xl font-semibold tracking-tight">
          <span className="text-zinc-50">Route</span>
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            Lab
          </span>
        </h1>
        <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
          Benchmark open-source LLMs side by side and find the best model for your
          task, by quality, speed and cost.
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
          {notice && (
            <p className="text-sm text-amber-400" role="alert">
              {notice}
            </p>
          )}
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
            cardStates.size === 1
              ? "grid-cols-1"
              : cardStates.size === 2
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
            <ExportButton results={results} prompt={ranPrompt} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center py-8 border-t border-white/10">
        <p className="text-xs text-zinc-600">
          Open source &middot;{" "}
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