// lib/schema.ts
import { Type } from "@google/genai";

// Minimal, robust schema to enforce structured output if user toggles “JSON”
export const TutorialSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          startTimecode: { type: Type.STRING }, // "MM:SS"
          endTimecode: { type: Type.STRING },
          screenshotIds: { type: Type.ARRAY, items: { type: Type.STRING } }, // e.g. ["s1","s3"]
        },
        required: ["index", "title", "description", "screenshotIds"],
        propertyOrdering: [
          "index",
          "title",
          "description",
          "startTimecode",
          "endTimecode",
          "screenshotIds",
        ],
      },
    },
  },
  required: ["title", "summary", "steps"],
  propertyOrdering: ["title", "summary", "prerequisites", "steps"],
} as const;

export const MeetingSummarySchema = {
  type: Type.OBJECT,
  properties: {
    meetingTitle: { type: Type.STRING },
    meetingDate: { type: Type.STRING }, // YYYY-MM-DD
    durationMinutes: { type: Type.INTEGER },
    attendees: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          department: { type: Type.STRING },
        },
        required: ["name"],
        propertyOrdering: ["name", "role", "department"],
      },
    },
    summary: { type: Type.STRING },
    keyTopics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          order: { type: Type.INTEGER },
          title: { type: Type.STRING },
          details: { type: Type.STRING },
          startTimecode: { type: Type.STRING }, // "MM:SS" or "HH:MM:SS"
          endTimecode: { type: Type.STRING },
          speaker: { type: Type.STRING },
        },
        required: ["order", "title", "details"],
        propertyOrdering: [
          "order",
          "title",
          "details",
          "startTimecode",
          "endTimecode",
          "speaker",
        ],
      },
    },
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          owners: { type: Type.ARRAY, items: { type: Type.STRING } },
          status: {
            type: Type.STRING,
            enum: ["proposed", "approved", "blocked", "deferred"],
          },
          timecode: { type: Type.STRING },
        },
        required: ["description"],
        propertyOrdering: ["description", "owners", "status", "timecode"],
      },
    },
    actionItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING },
          owner: { type: Type.STRING },
          dueDate: { type: Type.STRING }, // YYYY-MM-DD
          timecode: { type: Type.STRING },
        },
        required: ["task", "owner"],
        propertyOrdering: ["task", "owner", "dueDate", "timecode"],
      },
    },
    followUps: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["meetingTitle", "meetingDate", "summary", "keyTopics"],
  propertyOrdering: [
    "meetingTitle",
    "meetingDate",
    "durationMinutes",
    "attendees",
    "summary",
    "keyTopics",
    "decisions",
    "actionItems",
    "followUps",
  ],
} as const;

