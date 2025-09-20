// app/api/gemini/keyframes/route.ts
import { NextResponse } from "next/server";

import { AppError, getErrorMessage, logError } from "@/lib/errors";
import { generateKeyframeSuggestions } from "@/lib/services/keyframeService";
import { parseKeyframeRequest } from "@/lib/validators/requestValidators";

export const runtime = "nodejs";
const FALLBACK_ERROR = "Keyframe suggestion failed";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = parseKeyframeRequest(body);
    const result = await generateKeyframeSuggestions(parsed);
    return NextResponse.json(result);
  } catch (error) {
    logError(error);
    const status = error instanceof AppError ? error.status ?? 500 : 500;
    return NextResponse.json({ error: getErrorMessage(error, FALLBACK_ERROR) }, { status });
  }
}
