"use client";

import { useState } from "react";

const PRESETS = [
  { label: "Write a Python function", prompt: "Write a Python function that generates the first N Fibonacci numbers." },
  { label: "Summarize text", prompt: "Summarize the following text in 3 bullet points:\n\nClimate change is one of the most pressing challenges of our time. Rising global temperatures are causing more frequent and severe weather events, from hurricanes to wildfires. Agricultural systems worldwide are under stress, with crop yields declining in many regions due to drought and unpredictable weather patterns. Scientists warn that without significant reductions in greenhouse gas emissions, these trends will accelerate, leading to food shortages, mass migration, and economic instability. However, there is hope: advances in renewable energy, carbon capture technology, and sustainable farming practices offer pathways to mitigate the worst effects. The key is urgent, coordinated action at both the policy and individual levels." },
  { label: "Explain a bug", prompt: "Explain the bug in this code and how to fix it:\n\n```javascript\nfunction calculateAverage(arr) {\n  let sum = 0;\n  for (let i = 0; i <= arr.length; i++) {\n    sum += arr[i];\n  }\n  return sum / arr.length;\n}\n```" },
  { label: "Extract JSON from text", prompt: "Extract the key information from this text and return it as JSON:\n\n\"John Doe is a 34-year-old software engineer based in San Francisco. He has 8 years of experience working with Python, React, and PostgreSQL. He's currently looking for senior developer roles at startups.\"" },
];

interface Props {
  prompt: string;
  onChange: (prompt: string) => void;
  onRun: () => void;
  disabled: boolean;
  running: boolean;
  isEmpty: boolean;
}

export default function PromptInput({ prompt, onChange, onRun, disabled, running, isEmpty }: Props) {
  const [showPresets, setShowPresets] = useState(false);

  const selectPreset = (presetPrompt: string) => {
    onChange(presetPrompt);
    setShowPresets(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-zinc-400">Your task prompt</label>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          {showPresets ? "Hide presets" : "Use a preset"}
        </button>
      </div>

      {showPresets && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => selectPreset(p.prompt)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste your prompt here, or pick a preset above..."
        rows={4}
        disabled={disabled}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none disabled:opacity-50 font-mono"
      />

      <button
        onClick={onRun}
        disabled={disabled || !prompt.trim()}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
          disabled || !prompt.trim()
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            : running
            ? "bg-zinc-700 text-zinc-300 cursor-wait"
            : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/25"
        }`}
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            Running benchmarks...
          </span>
        ) : isEmpty ? (
          "Run Example"
        ) : (
          `Benchmark ${disabled ? "" : "Selected"} Models`
        )}
      </button>
    </div>
  );
}