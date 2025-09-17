import { SchemaType } from "@/lib/types";

export type FeatureWeights = Record<string, number>;

export const STORAGE_PREFIX = "dspy.featureWeights.";

export const defaultsFor = (mode: SchemaType): FeatureWeights => {
  return mode === "meetingSummary"
    ? {
        schemaFocus: 2.0,
        grounding: 2.0,
        screenshotCitation: 0.5,
        timecodeOrdering: 0.5,
        titleHint: 0.5,
        formatWhenEnforced: 1.0,
        formatWhenNotEnforced: 1.0,
        noScreenshotsBehavior: 0.5,
      }
    : {
        schemaFocus: 2.0,
        grounding: 2.0,
        screenshotCitation: 1.0,
        timecodeOrdering: 2.0,
        titleHint: 0.5,
        formatWhenEnforced: 1.0,
        formatWhenNotEnforced: 0.5,
        noScreenshotsBehavior: 0.5,
      };
};

export const toLevel = (w: number): "critical" | "important" | "optional" =>
  w >= 1.5 ? "critical" : w > 0.75 ? "important" : "optional";

export const toWeight = (level: string): number =>
  level === "critical" ? 2.0 : level === "optional" ? 0.5 : 1.0;

export const getStorageKey = (schemaType: SchemaType): string =>
  `${STORAGE_PREFIX}${schemaType}`;

export const categories = [
  { key: "schemaFocus", label: "Schema focus" },
  { key: "grounding", label: "Grounding (timeline + screenshots)" },
  { key: "screenshotCitation", label: "Cite screenshot IDs" },
  { key: "timecodeOrdering", label: "Chronological ordering" },
  { key: "titleHint", label: "Respect title hint" },
  { key: "formatWhenEnforced", label: "Strict JSON when enforced" },
  { key: "formatWhenNotEnforced", label: "Markdown fallback when not enforced" },
  { key: "noScreenshotsBehavior", label: "No-screenshot handling" },
] as const;