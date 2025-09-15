// lib/gemini.ts
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is not set");
}

export const ai = new GoogleGenAI({ apiKey });

export const GEMINI_MODEL_ID = "gemini-2.5-pro";

