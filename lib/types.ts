// lib/types.ts
export type Shot = {
  id: string; // s1, s2, ... (unique per capture session)
  timeSec: number;
  timecode: string; // "MM:SS"
  dataUrl: string; // local preview
  label?: string;
  note?: string;
};

export type SchemaType = "tutorial" | "meetingSummary";

export type PromptMode = "manual" | "dspy";

export type PromptOptimizationMeta = {
  requestedMode: PromptMode;
  appliedMode: PromptMode;
  score?: number;
  coverage?: number;
  parsed?: boolean;
  parseError?: string;
  feedback?: string;
  satisfied?: string[];
  missing?: string[];
  auto?: string | null;
  trainsetSize?: number;
  requestedModel?: string;
  message?: string;
  rawPrompt?: string;
};
