// app/api/gemini/export/route.ts
import { NextResponse } from "next/server";
import { getErrorMessage, logError } from "@/lib/errors";
import { buildPdfBuffer } from "@/lib/services/exportService";
import { parseExportRequest } from "@/lib/validators/requestValidators";
import { getSchemaTemplateById } from "@/lib/schemaTemplates";

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

const slugify = (value: string, fallback = "document") => {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      schemaType,
      enforceSchema,
      structuredResult,
      rawText,
      resultText,
      shots,
      options,
    } = parseExportRequest(body);

    const exportTemplateId = structuredResult?.templateId ?? schemaType;
    let templateName = exportTemplateId === "tutorial" ? "tutorial-guide" : "meeting-summary";
    try {
      const template = await getSchemaTemplateById(exportTemplateId);
      if (template?.name) {
        templateName = slugify(template.name, templateName);
      }
    } catch {
      // ignore lookup errors and use fallback
    }

    // Build the PDF with validated options; returns enhanced result.
    const { buffer: pdfBuffer, filename: suggestedName, warnings } = await buildPdfBuffer({
      schemaType,
      enforceSchema,
      structuredResult,
      rawText,
      legacyResultText: resultText,
      shots,
      options,
    });

    const baseName = sanitizeFilename(suggestedName || templateName);

    const pdfBody = new Uint8Array(pdfBuffer);

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
      "Content-Length": String(pdfBody.byteLength),
    };

    if (warnings && warnings.length > 0) {
      // Encode to keep header safe
      headers["X-Export-Warnings"] = encodeURIComponent(JSON.stringify(warnings.slice(0, 20)));
    }

    return new NextResponse(pdfBody, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    logError(err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}
