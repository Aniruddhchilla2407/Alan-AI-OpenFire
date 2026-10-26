"use client";

import { useState, useEffect, useImperativeHandle, forwardRef } from "react";

const STORAGE_KEY = "routelab_budget";
const DEFAULT_BUDGET = 20;

export interface BudgetEntry {
  timestamp: number;
  modelId: string;
  modelName: string;
  cost: number;
  prompt: string;
}

export interface BudgetData {
  budget: number;
  totalSpent: number;
  history: BudgetEntry[];
}

export interface BudgetTrackerHandle {
  recordSpend: (cost: number, modelId: string, modelName: string, prompt: string) => void;
}

function loadBudget(): BudgetData {
  if (typeof window === "undefined") return { budget: DEFAULT_BUDGET, totalSpent: 0, history: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { budget: DEFAULT_BUDGET, totalSpent: 0, history: [] };
}

function saveBudget(data: BudgetData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const BudgetTracker = forwardRef<BudgetTrackerHandle, object>(function BudgetTracker(_props, ref) {
  const [data, setData] = useState<BudgetData | null>(null);
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  useEffect(() => {
    const loaded = loadBudget();
    setData(loaded);
    setBudgetInput(String(loaded.budget));
  }, []);

  useImperativeHandle(ref, () => ({
    recordSpend(cost: number, modelId: string, modelName: string, prompt: string) {
      setData((prev) => {
        if (!prev) return prev;
        const newTotal = prev.totalSpent + cost;
        const updated: BudgetData = {
          ...prev,
          totalSpent: newTotal,
          history: [
            ...prev.history,
            { timestamp: Date.now(), modelId, modelName, cost, prompt: prompt.slice(0, 80) },
          ],
        };
        saveBudget(updated);
        return updated;
      });
    },
  }));

  if (!data) return null;

  const pct = data.budget > 0 ? (data.totalSpent / data.budget) * 100 : 0;
  const isWarning = pct >= 80;
  const isExceeded = pct >= 100;

  const handleSetBudget = () => {
    const val = parseFloat(budgetInput);
    if (!isNaN(val) && val > 0) {
      setData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, budget: val };
        saveBudget(updated);
        return updated;
      });
    }
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300">Session Budget</h3>
        <button
          onClick={() => {
            setEditing(!editing);
            setBudgetInput(String(data.budget));
          }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Budget in USD"
            min="1"
          />
          <button
            onClick={handleSetBudget}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors cursor-pointer"
          >
            Set
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-zinc-400">
          Spent <span className="text-zinc-200 font-mono font-semibold">${data.totalSpent.toFixed(4)}</span>
        </span>
        <span className="text-zinc-500">
          of <span className="text-zinc-300">${data.budget.toFixed(0)}</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isExceeded ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${isWarning ? "text-amber-400" : "text-zinc-500"}`}>
          {isExceeded ? "Budget exceeded!" : isWarning ? "Approaching limit" : `${pct.toFixed(0)}% used`}
        </span>
        {data.history.length > 0 && (
          <span className="text-zinc-600">{data.history.length} runs</span>
        )}
      </div>

      {/* Recent history */}
      {data.history.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2">Recent runs</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {[...data.history].reverse().slice(0, 5).map((h, i) => (
              <div key={`${h.timestamp}-${i}`} className="flex items-center justify-between text-xs">
                <span className="text-zinc-500 truncate flex-1 mr-2">{h.modelName}</span>
                <span className="text-zinc-400 font-mono">${h.cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default BudgetTracker;