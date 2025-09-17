"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

const STORAGE_KEY = "dspy.jsonBonus";

interface JSONBonusControlProps {
  enabled: boolean;
}

export default function JSONBonusControl({ enabled }: JSONBonusControlProps) {
  const [value, setValue] = useState(0.25);

  useEffect(() => {
    try {
      if (typeof window === "undefined") {
        return;
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const n = raw != null ? Number.parseFloat(raw) : NaN;
      if (Number.isFinite(n)) setValue(Math.max(0, Math.min(1, n)));
    } catch {}
  }, []);

  const update = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setValue(clamped);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(clamped));
        window.dispatchEvent(new CustomEvent("dspy:jsonBonus", { detail: clamped }));
      } catch {}
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1 pr-4">
          <p className="text-sm font-medium text-gray-800">JSON bonus weight</p>
          <p className="text-xs text-gray-500">
            Extra credit when DSPy returns valid JSON for the optimized prompt. A higher value encourages
            well-formed JSON in the optimization loop.
          </p>
          {!enabled && <p className="text-xs text-gray-400">Switch to DSPy mode to apply this during optimization.</p>}
        </div>
        <Badge variant="outline" className="border-gray-300 text-gray-700">
          {value.toFixed(2)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-gray-500">0</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => update(parseFloat(e.target.value))}
          disabled={!enabled}
          aria-label="JSON bonus weight"
          className="w-full accent-indigo-600 disabled:opacity-50"
        />
        <span className="text-xs text-gray-500">1</span>
      </div>
    </div>
  );
}