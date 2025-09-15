// lib/geminiPrompts.ts
import { MeetingSummarySchema, TutorialSchema } from "@/lib/schema";
import { SchemaType } from "@/lib/types";

type SchemaConfig = {
  persona: string;
  requirements: string;
  fallbackOutput: string;
  schema: unknown;
  hintLabel: string;
};

const MEETING_SCHEMA_CONFIG: SchemaConfig = {
  persona:
    "You are an expert meeting scribe. Analyze the video and provided named screenshots to build an executive-ready meeting summary.",
  requirements: [
    "- Capture the precise meeting title and ensure it is professional.",
    "- Provide the meeting date in YYYY-MM-DD format (infer from context; if unclear, use your best estimate).",
    "- Summarize the meeting in two to three sentences covering intent and outcome.",
    "- List attendees with roles or departments when mentioned.",
    "- Identify each key topic in chronological order with concise details and relevant speakers/timecodes.",
    "- Record decisions with current status and owners when discussed.",
    "- Capture action items with owners and due dates if provided.",
    "- Note other follow-ups only if they do not fit decisions or action items.",
  ].join("\n"),
  fallbackOutput:
    "Return well-structured Markdown that clearly labels sections: Meeting Title, Meeting Date, Summary, Attendees, Key Topics, Decisions, Action Items, Follow Ups.",
  schema: MeetingSummarySchema,
  hintLabel: "meeting title",
};

const TUTORIAL_SCHEMA_CONFIG: SchemaConfig = {
  persona:
    "You are an expert technical writer. Analyze the video and the provided named screenshots to produce a complete, concise step-by-step tutorial.",
  requirements: [
    "- Focus on observable actions in the video.",
    "- Provide a short title and a 2-3 sentence summary.",
    "- Include prerequisites (if any).",
    "- Return steps in the exact order they should be performed.",
    "- For each step: include a short title, a clear description, and (if evident) start/end timecodes from the video.",
    "- Use ONLY the provided screenshot IDs to reference images (not URIs); match them to the most relevant step(s).",
    "- Keep descriptions actionable and specific.",
  ].join("\n"),
  fallbackOutput:
    "Return well-structured Markdown with numbered steps. When placing images, include lines like: [screenshots: s3, s5].",
  schema: TutorialSchema,
  hintLabel: "title",
};

const CONFIG_MAP: Record<SchemaType, SchemaConfig> = {
  tutorial: TUTORIAL_SCHEMA_CONFIG,
  meetingSummary: MEETING_SCHEMA_CONFIG,
};

export function getSchemaConfig(type: SchemaType) {
  return CONFIG_MAP[type];
}
