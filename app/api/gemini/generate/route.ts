// app/api/gemini/generate/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import { parseGenerateRequest } from "@/lib/validators/requestValidators";
import { generateStructuredOutput } from "@/lib/services/generationService";
import type { GenerateRequestBody } from "@/lib/types/api";

export const runtime = "nodejs";
const FALLBACK_ERROR = "Generation failed";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = parseGenerateRequest(body) as GenerateRequestBody;

    const result = await generateStructuredOutput(parsed);

    return NextResponse.json(result);
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
