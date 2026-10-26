"use client";

import { MODELS, type ModelConfig } from "@/config/models";

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}

export default function ModelSelector({ selected, onChange, disabled }: Props) {
  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) {
      if (selected.length <= 2) return; // minimum 2
      onChange(selected.filter((s) => s !== id));
    } else {
      if (selected.length >= 4) return; // maximum 4
      onChange([...selected, id]);
    }
  };

  // Group models by provider
  const grouped: Record<string, ModelConfig[]> = {};
  MODELS.forEach((m) => {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  });

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-zinc-400">
        Select 2–4 models to compare
      </label>
      {Object.entries(grouped).map(([provider, models]) => (
        <div key={provider}>
          <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider">{provider}</p>
          <div className="flex flex-wrap gap-2">
            {models.map((m) => {
              const isSelected = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 ${
                    isSelected
                      ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                      : "bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/60"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  {m.displayName}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}