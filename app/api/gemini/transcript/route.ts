// app/api/gemini/transcript/route.ts
import { NextResponse } from "next/server";

import { AppError, getErrorMessage, logError } from "@/lib/errors";
import { generateTranscript } from "@/lib/services/transcriptService";
import { parseTranscriptRequest } from "@/lib/validators/requestValidators";

export const runtime = "nodejs";
const FALLBACK_ERROR = "Transcript generation failed";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = parseTranscriptRequest(body);
    const transcript = await generateTranscript(parsed);
    return NextResponse.json(transcript);
  } catch (error) {
    logError(error);
    const status = error instanceof AppError ? error.status ?? 500 : 500;
    return NextResponse.json({ error: getErrorMessage(error, FALLBACK_ERROR) }, { status });
  }
}
