// app/api/gemini/export/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import { buildPdfBuffer } from "@/lib/services/exportService";
import { parseExportRequest } from "@/lib/validators/requestValidators";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Export failed";

/**
 * Basic, safe filename sanitizer for Content-Disposition.
 * - Normalizes Unicode
 * - Removes control chars and forbidden filesystem characters
 * - Collapses whitespace to hyphens
 * - Trims length to 100 chars
 */
function sanitizeFilename(input: string | undefined, fallback = "document"): string {
  const base = (input ?? "").toString().trim();
  const normalized = base ? base.normalize("NFKC") : "";
  const cleaned = normalized
    .replace(/[\u0000-\u001f\u007f/\\?*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+$/, "")
    .slice(0, 100);
  return cleaned || fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { schemaType, enforceSchema, resultText, shots, options } = parseExportRequest(body);

    // Build the PDF with validated options; returns enhanced result.
    const { buffer: pdfBuffer, filename: suggestedName, warnings } = await buildPdfBuffer({
      schemaType,
      enforceSchema,
      resultText,
      shots,
      options,
    });

    const baseName = sanitizeFilename(
      suggestedName || (schemaType === "tutorial" ? "tutorial-guide" : "meeting-summary"),
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    };

    if (warnings && warnings.length > 0) {
      // Encode to keep header safe
      headers["X-Export-Warnings"] = encodeURIComponent(JSON.stringify(warnings.slice(0, 20)));
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
