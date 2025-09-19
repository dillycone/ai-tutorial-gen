// app/api/gemini/upload-images/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import { parseUploadImagesRequest } from "@/lib/validators/requestValidators";
import { uploadScreenshots } from "@/lib/services/videoService";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Upload failed";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { screenshots } = parseUploadImagesRequest(body);
    const uploads = await uploadScreenshots(screenshots);
    return NextResponse.json({ files: uploads });
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
