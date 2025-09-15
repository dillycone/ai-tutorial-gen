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
