// app/api/gemini/upload/route.ts
import { NextResponse } from "next/server";
import { uploadVideoFile } from "@/lib/services/videoService";
import { getErrorMessage, logError } from "@/lib/errors";
import { requireFileFromForm } from "@/lib/validators/requestValidators";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Upload failed";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = requireFileFromForm(form);
    const uploaded = await uploadVideoFile(file);
    return NextResponse.json(uploaded);
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
