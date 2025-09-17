"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SchemaType } from "@/lib/types";
import {
  FeatureWeights,
  defaultsFor,
  toLevel,
  toWeight,
  getStorageKey,
  categories,
} from "@/lib/featureImportance";

interface FeatureImportanceControlProps {
  enabled: boolean;
  schemaType: SchemaType;
}

export default function FeatureImportanceControl({ enabled, schemaType }: FeatureImportanceControlProps) {
  type Weights = Record<string, number>;

  const storageKey = getStorageKey(schemaType);
  const [weights, setWeights] = useState<Weights>(() => {
    const base = defaultsFor(schemaType);

    // Guard browser-specific APIs
    if (typeof window === "undefined") {
      return base;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Weights;
        if (parsed && typeof parsed === "object") {
          return { ...base, ...parsed };
        }
      }
    } catch {
      // ignore
    }
    return base;
  });

  // Reload defaults on schema change, merging any saved overrides.
  useEffect(() => {
    const base = defaultsFor(schemaType);

    // Guard browser-specific APIs
    if (typeof window === "undefined") {
      setWeights(base);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Weights;
        if (parsed && typeof parsed === "object") {
          setWeights({ ...base, ...parsed });
          // Broadcast to sync workbench hook
          window.dispatchEvent(
            new CustomEvent("dspy:featureWeights", {
              detail: { schemaType, weights: { ...base, ...parsed } },
            })
          );
          return;
        }
      }
    } catch {
      // ignore
    }
    setWeights(base);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(base));
    } catch {
      // ignore
    }
    window.dispatchEvent(
      new CustomEvent("dspy:featureWeights", { detail: { schemaType, weights: base } })
    );
  }, [schemaType, storageKey]);

  const persistAndBroadcast = (next: FeatureWeights) => {
    setWeights(next as Weights);

    // Guard browser-specific APIs
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(
        new CustomEvent("dspy:featureWeights", { detail: { schemaType, weights: next } })
      );
    } catch {
      // ignore
    }
  };

  const handleChange = (key: string, level: string) => {
    const next = { ...weights, [key]: toWeight(level) };
    persistAndBroadcast(next);
  };

  const handleReset = () => {
    const base = defaultsFor(schemaType);
    persistAndBroadcast(base);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1 pr-4">
          <p className="text-sm font-medium text-gray-800">Feature importance</p>
          <p className="text-xs text-gray-500">
            Adjust how strongly the optimizer values different guidance. Higher weights make a feature more
            influential in the scoring metric.
          </p>
          {!enabled && <p className="text-xs text-gray-400">Switch to DSPy mode to apply these during optimization.</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-gray-300 text-gray-700">
            {Object.values(weights).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0).toFixed(1)} total
          </Badge>
          <Button variant="outline" size="sm" onClick={handleReset} className="border-gray-300 text-gray-700">
            Reset defaults
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {categories.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/60 p-3">
            <div className="text-sm text-gray-800">{label}</div>
            <Select
              value={toLevel(weights[key]).toString()}
              onValueChange={(val) => handleChange(key, val)}
              disabled={!enabled}
            >
              <SelectTrigger className="w-[160px] bg-white border-gray-300 text-gray-900 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50">
                <SelectValue placeholder="Importance" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="critical">Critical (2.0)</SelectItem>
                <SelectItem value="important">Important (1.0)</SelectItem>
                <SelectItem value="optional">Optional (0.5)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}