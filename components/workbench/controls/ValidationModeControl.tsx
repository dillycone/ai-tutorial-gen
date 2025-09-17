"use client";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ValidationModeControlProps {
  enabled: boolean;
}

export default function ValidationModeControl({ enabled }: ValidationModeControlProps) {
  const STORAGE_KEY = "dspy.alwaysFullValidation";
  const [alwaysFull, setAlwaysFull] = useState<boolean>(() => {
    try {
      if (typeof window === "undefined") {
        return false;
      }
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, String(alwaysFull));
      }
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dspy:alwaysFullValidation", { detail: alwaysFull }));
      }
    } catch {
      // ignore
    }
  }, [alwaysFull]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="space-y-1 pr-4">
        <p className="text-sm font-medium text-gray-800">Validation mode</p>
        <p className="text-xs text-gray-500">
          Progressive validation speeds up early optimization by using smaller sets, then expands for final checks.
          Enable full-set validation to always use the complete set for every round.
        </p>
        {!enabled && <p className="text-xs text-gray-400">Switch to DSPy mode to apply this during optimization.</p>}
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="always-full-validation" className="text-xs text-gray-700">
          Always use full set
        </Label>
        <Switch
          id="always-full-validation"
          checked={alwaysFull}
          onCheckedChange={(v) => setAlwaysFull(Boolean(v))}
          disabled={!enabled}
        />
      </div>
    </div>
  );
}