// app/api/gemini/export/route.ts
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFImage } from "pdf-lib";
import { SchemaType } from "@/lib/types";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

const FALLBACK_ERROR = "Export failed";

const PAGE_WIDTH = 612; // 8.5in * 72dpi
const PAGE_HEIGHT = 792; // 11in * 72dpi
const PAGE_MARGIN = 48;

const TITLE_SIZE = 24;
const SUBTITLE_SIZE = 18;
const HEADING_SIZE = 16;
const BODY_SIZE = 12;
const SMALL_SIZE = 11;

const LINE_GAP = 4;

// --- Typographic helpers ---
const FOOTER_SIZE = 10;
const MIN_LINES_AFTER_HEADING = 2;

const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LEADING = (pt: number) => pt + LINE_GAP; // simple line-height

function lineHeightFor(size: number) {
  return LEADING(size);
}

type ShotForExport = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

type ExportRequest = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  resultText: string;
  shots: ShotForExport[];
};

type TutorialSchema = {
  title?: string;
  summary?: string;
  prerequisites?: string[];
  steps?: Array<{
    index?: number;
    title?: string;
    description?: string;
    startTimecode?: string;
    endTimecode?: string;
    screenshotIds?: string[];
  }>;
};

type MeetingSummarySchema = {
  meetingTitle?: string;
  meetingDate?: string;
  durationMinutes?: number;
  attendees?: Array<{ name?: string; role?: string; department?: string }>;
  summary?: string;
  keyTopics?: Array<{
    order?: number;
    title?: string;
    details?: string;
    startTimecode?: string;
    endTimecode?: string;
    speaker?: string;
  }>;
  decisions?: Array<{ description?: string; owners?: string[]; status?: string; timecode?: string }>;
  actionItems?: Array<{ task?: string; owner?: string; dueDate?: string; timecode?: string }>;
  followUps?: string[];
};

type EmbeddedShot = {
  shot: ShotForExport;
  image: PDFImage;
  width: number;
  height: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ExportRequest>;
    if (!body || typeof body.resultText !== "string" || !body.schemaType) {
      return NextResponse.json({ error: "Invalid export payload" }, { status: 400 });
    }

    const schemaType = body.schemaType;
    const enforceSchema = Boolean(body.enforceSchema);
    const shots = Array.isArray(body.shots) ? body.shots : [];
    const resultText = body.resultText;

    let parsed: TutorialSchema | MeetingSummarySchema | null = null;
    try {
      parsed = JSON.parse(resultText) as TutorialSchema | MeetingSummarySchema;
    } catch {
      parsed = null;
    }

    const pdfBuffer = await buildPdf({ schemaType, parsed, resultText, shots, enforceSchema });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=${schemaType === "tutorial" ? "tutorial-guide" : "meeting-summary"}.pdf`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err: unknown) {
    console.error("Export error:", err);
    return NextResponse.json({ error: getErrorMessage(err, FALLBACK_ERROR) }, { status: 500 });
  }
}

type BuildPdfArgs = {
  schemaType: SchemaType;
  parsed: TutorialSchema | MeetingSummarySchema | null;
  resultText: string;
  shots: ShotForExport[];
  enforceSchema: boolean;
};

type PdfContext = {
  doc: PDFDocument;
  bold: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  regular: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  embeddedShots: Map<string, EmbeddedShot>;
};

type PageState = {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

async function buildPdf({ schemaType, parsed, resultText, shots, enforceSchema }: BuildPdfArgs) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const embeddedShots = await embedShots(doc, shots);
  const ctx: PdfContext = { doc, bold, regular, embeddedShots };

  let state = addPage(ctx);

  // Decide a running title for footers
  let runningTitle = schemaType === "tutorial" ? "Tutorial Guide" : "Meeting Summary";

  if (schemaType === "tutorial" && parsed && isTutorial(parsed)) {
    runningTitle = (parsed.title && parsed.title.trim()) || runningTitle;
    state = renderTutorial(ctx, state, parsed);
  } else if (schemaType === "meetingSummary" && parsed && isMeetingSummary(parsed)) {
    runningTitle = (parsed.meetingTitle && parsed.meetingTitle.trim()) || runningTitle;
    state = renderMeetingSummary(ctx, state, parsed);
  } else {
    state = renderFallback(ctx, state, resultText, schemaType, enforceSchema);
  }

  if (ctx.embeddedShots.size > 0) {
    renderShotsAppendix(ctx, state);
  }

  // Add footers with page numbers and running title
  addFooters(ctx, runningTitle);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

function renderTutorial(ctx: PdfContext, state: PageState, tutorial: TutorialSchema) {
  state = drawTitle(ctx, state, tutorial.title || "Tutorial Guide");
  if (tutorial.summary) {
    state = drawParagraph(ctx, state, tutorial.summary, BODY_SIZE);
  }

  if (Array.isArray(tutorial.prerequisites) && tutorial.prerequisites.length) {
    state = drawHeading(ctx, state, "Prerequisites", HEADING_SIZE);
    tutorial.prerequisites.forEach((item, idx) => {
      state = drawParagraph(ctx, state, `${idx + 1}. ${item}`, BODY_SIZE);
    });
  }

  if (Array.isArray(tutorial.steps)) {
    tutorial.steps.forEach((step, index) => {
      state = drawHeading(
        ctx,
        state,
        `Step ${step.index ?? index + 1}: ${step.title ?? "Untitled Step"}`,
        SUBTITLE_SIZE,
        { keepNextLines: 2 },
      );
      if (step.description) {
        state = drawParagraph(ctx, state, step.description, BODY_SIZE);
      }

      if (step.startTimecode || step.endTimecode) {
        const timing: string[] = [];
        if (step.startTimecode) timing.push(`Start: ${step.startTimecode}`);
        if (step.endTimecode) timing.push(`End: ${step.endTimecode}`);
        state = drawParagraph(ctx, state, timing.join(" · "), SMALL_SIZE);
      }

      if (Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0) {
        step.screenshotIds.forEach((shotId) => {
          state = drawShot(ctx, state, shotId);
        });
      }
    });
  }

  return state;
}

function renderMeetingSummary(ctx: PdfContext, state: PageState, summary: MeetingSummarySchema) {
  state = drawTitle(ctx, state, summary.meetingTitle || "Meeting Summary");
  const meta: string[] = [];
  if (summary.meetingDate) meta.push(`Date: ${summary.meetingDate}`);
  if (typeof summary.durationMinutes === "number") meta.push(`Duration: ${summary.durationMinutes} minutes`);
  if (meta.length) {
    state = drawParagraph(ctx, state, meta.join(" · "), SMALL_SIZE);
  }
  if (summary.summary) {
    state = drawParagraph(ctx, state, summary.summary, BODY_SIZE);
  }

  if (Array.isArray(summary.attendees) && summary.attendees.length) {
    state = drawHeading(ctx, state, "Attendees", HEADING_SIZE);
    summary.attendees.forEach((attendee) => {
      const line = [attendee.name, attendee.role, attendee.department].filter(Boolean).join(" · ");
      state = drawParagraph(ctx, state, line, BODY_SIZE);
    });
  }

  if (Array.isArray(summary.keyTopics) && summary.keyTopics.length) {
    state = drawHeading(ctx, state, "Key Topics", HEADING_SIZE);
    summary.keyTopics
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((topic, idx) => {
        state = drawHeading(
          ctx,
          state,
          `${idx + 1}. ${topic.title ?? "Topic"}`,
          SUBTITLE_SIZE,
          { keepNextLines: 2 },
        );
        const metaLine = [topic.speaker, topic.startTimecode, topic.endTimecode].filter(Boolean).join(" · ");
        if (metaLine) {
          state = drawParagraph(ctx, state, metaLine, SMALL_SIZE);
        }
        if (topic.details) {
          state = drawParagraph(ctx, state, topic.details, BODY_SIZE);
        }
      });
  }

  state = renderListSection(ctx, state, "Decisions", summary.decisions, (decision) => {
    const lines = [decision.description];
    if (decision.status) lines.push(`Status: ${decision.status}`);
    if (Array.isArray(decision.owners) && decision.owners.length) lines.push(`Owners: ${decision.owners.join(", ")}`);
    if (decision.timecode) lines.push(`Timecode: ${decision.timecode}`);
    return lines.filter(Boolean).join("\n");
  });

  state = renderListSection(ctx, state, "Action Items", summary.actionItems, (item) => {
    const lines = [`Task: ${item.task}`, `Owner: ${item.owner}`];
    if (item.dueDate) lines.push(`Due: ${item.dueDate}`);
    if (item.timecode) lines.push(`Timecode: ${item.timecode}`);
    return lines.filter(Boolean).join("\n");
  });

  if (Array.isArray(summary.followUps) && summary.followUps.length) {
    state = drawHeading(ctx, state, "Follow Ups", HEADING_SIZE);
    summary.followUps.forEach((item, idx) => {
      state = drawParagraph(ctx, state, `${idx + 1}. ${item}`, BODY_SIZE);
    });
  }

  return state;
}

function renderListSection<T>(
  ctx: PdfContext,
  state: PageState,
  title: string,
  items: T[] | undefined,
  formatter: (item: T) => string,
) {
  if (!Array.isArray(items) || items.length === 0) return state;

  state = drawHeading(ctx, state, title, HEADING_SIZE);
  items.forEach((item, idx) => {
    const content = formatter(item);
    state = drawParagraph(ctx, state, `${idx + 1}. ${content}`, BODY_SIZE);
  });
  return state;
}

function renderFallback(
  ctx: PdfContext,
  state: PageState,
  resultText: string,
  schemaType: SchemaType,
  enforceSchema: boolean,
) {
  state = drawTitle(ctx, state, schemaType === "tutorial" ? "Tutorial" : "Meeting Summary");
  if (enforceSchema) {
    state = drawParagraph(ctx, state, "Structured output could not be parsed. Showing raw response:", BODY_SIZE);
  }
  state = drawParagraph(ctx, state, resultText, BODY_SIZE);
  return state;
}

function renderShotsAppendix(ctx: PdfContext, state: PageState) {
  state = addPage(ctx);
  state = drawTitle(ctx, state, "Screenshot Appendix");
  for (const shotId of ctx.embeddedShots.keys()) {
    state = drawShot(ctx, state, shotId);
  }
  return state;
}

function addFooters(ctx: PdfContext, title?: string) {
  const pages = ctx.doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const y = 24; // below content margin
    const num = `${i + 1}/${pages.length}`;
    const numWidth = ctx.regular.widthOfTextAtSize(num, FOOTER_SIZE);

    if (title) {
      page.drawText(title, {
        x: PAGE_MARGIN,
        y,
        font: ctx.regular,
        size: FOOTER_SIZE,
        color: rgb(0.4, 0.4, 0.4),
      });
    }

    page.drawText(num, {
      x: PAGE_WIDTH - PAGE_MARGIN - numWidth,
      y,
      font: ctx.regular,
      size: FOOTER_SIZE,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
}

function drawShot(ctx: PdfContext, state: PageState, shotId: string) {
  const entry = ctx.embeddedShots.get(shotId);
  if (!entry) return state;

  const labelText = `${entry.shot.label || entry.shot.id} (${entry.shot.timecode})`;
  const noteText = entry.shot.note || "";

  const labelH = measureParagraphHeight(ctx, labelText, BODY_SIZE, ctx.bold);
  const noteH = noteText ? measureParagraphHeight(ctx, noteText, SMALL_SIZE) : 0;

  // Remaining space for the image after label+note, on this page
  let available = state.y - PAGE_MARGIN - labelH - noteH - 2 * LINE_GAP;

  // Start with width-constrained scaling
  let scale = Math.min(1, CONTENT_WIDTH / entry.width);
  let imgW = entry.width * scale;
  let imgH = entry.height * scale;

  // If not enough room, try height-constrained scaling or move to a new page
  if (available <= 0 || imgH > available) {
    const heightScale = Math.max(0, available) / entry.height;
    if (heightScale >= 0.25) {
      scale = Math.min(scale, heightScale);
      imgW = entry.width * scale;
      imgH = entry.height * scale;
    } else {
      state = addPage(ctx);
      available = state.y - PAGE_MARGIN - labelH - noteH - 2 * LINE_GAP;
      const heightScale2 = Math.min(1, available / entry.height);
      scale = Math.min(CONTENT_WIDTH / entry.width, heightScale2);
      imgW = entry.width * scale;
      imgH = entry.height * scale;
    }
  }

  // Draw label (kept together)
  state = drawParagraph(ctx, state, labelText, BODY_SIZE, { bold: true, keepTogether: true });

  // Draw image
  state = ensureSpaceForImage(ctx, state, imgH);
  state.page.drawImage(entry.image, {
    x: PAGE_MARGIN + (CONTENT_WIDTH - imgW) / 2,
    y: state.y - imgH,
    width: imgW,
    height: imgH,
  });
  state.y -= imgH + LINE_GAP;

  // Draw caption/note (kept together)
  if (noteText) {
    state = drawParagraph(ctx, state, noteText, SMALL_SIZE, { keepTogether: true });
  }

  state.y -= LINE_GAP;
  return state;
}

function addPage(ctx: PdfContext): PageState {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { page, y: PAGE_HEIGHT - PAGE_MARGIN };
}

function ensureSpace(ctx: PdfContext, state: PageState, requiredHeight: number) {
  if (state.y - requiredHeight <= PAGE_MARGIN) {
    return addPage(ctx);
  }
  return state;
}

function ensureSpaceForImage(ctx: PdfContext, state: PageState, imageHeight: number) {
  if (state.y - imageHeight - LINE_GAP <= PAGE_MARGIN) {
    state = addPage(ctx);
  }
  return state;
}

function drawTitle(ctx: PdfContext, state: PageState, text: string) {
  const blockHeight = lineHeightFor(TITLE_SIZE) + LINE_GAP * 2;
  state = ensureSpace(ctx, state, blockHeight);
  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size: TITLE_SIZE,
    color: rgb(0, 0, 0),
  });
  state.y -= blockHeight;
  return state;
}

function drawHeading(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: { keepNextLines?: number } = {},
) {
  const keep = options.keepNextLines ?? (size >= SUBTITLE_SIZE ? MIN_LINES_AFTER_HEADING : 1);
  const reserve = lineHeightFor(size) + keep * lineHeightFor(BODY_SIZE) + LINE_GAP;
  state = ensureSpace(ctx, state, reserve);

  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size,
    color: rgb(0, 0, 0),
  });
  state.y -= lineHeightFor(size);
  return state;
}

function drawParagraph(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: { bold?: boolean; keepTogether?: boolean } = {},
) {
  const font = options.bold ? ctx.bold : ctx.regular;
  const paragraphs = text.split(/\n+/).filter(Boolean);
  const blocks = paragraphs.map((paragraph) => {
    const lines = wrapText(paragraph, font, size, CONTENT_WIDTH);
    return { lines, height: lines.length * lineHeightFor(size) };
  });

  if (options.keepTogether && blocks.length > 0) {
    const totalHeight =
      blocks.reduce((sum, block) => sum + block.height, 0) +
      (blocks.length > 1 ? (blocks.length - 1) * LINE_GAP : 0);
    state = ensureSpace(ctx, state, totalHeight);
  }

  blocks.forEach((block, pIndex) => {
    for (const line of block.lines) {
      if (!options.keepTogether) {
        state = ensureSpace(ctx, state, lineHeightFor(size));
      }
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font,
        size,
        color: rgb(0, 0, 0),
      });
      state.y -= lineHeightFor(size);
    }
    if (pIndex !== blocks.length - 1) {
      state.y -= LINE_GAP;
    }
  });

  return state;
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>,
  size: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  let current = "";

  const measure = (s: string) => font.widthOfTextAtSize(s, size);

  // Split a single too-long token into pieces that fit maxWidth
  function splitLongToken(token: string): string[] {
    if (measure(token) <= maxWidth) return [token];

    const parts: string[] = [];
    let start = 0;
    while (start < token.length) {
      let lo = 1;
      let hi = token.length - start;
      let best = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const seg = token.slice(start, start + mid);
        // account for hyphen on wrapped segments (except the last one)
        const w = measure(seg + (start + mid < token.length ? "-" : ""));
        if (w <= maxWidth) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      parts.push(token.slice(start, start + best));
      start += best;
    }
    return parts;
  }

  const rawTokens = text.split(/\s+/).filter(Boolean);
  for (const token of rawTokens) {
    const pieces = splitLongToken(token);
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] + (i < pieces.length - 1 ? "-" : "");
      const attempt = current ? `${current} ${piece}` : piece;
      if (measure(attempt) <= maxWidth) {
        current = attempt;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
  }

  if (current) lines.push(current);
  return lines;
}

function measureParagraphHeight(
  ctx: PdfContext,
  text: string,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>> = ctx.regular,
) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  let lines = 0;
  for (const p of paragraphs) {
    lines += wrapText(p, font, size, CONTENT_WIDTH).length;
  }
  // line heights + small gap between paragraphs
  return lines * lineHeightFor(size) + (paragraphs.length > 1 ? (paragraphs.length - 1) * LINE_GAP : 0);
}

function isTutorial(value: TutorialSchema | MeetingSummarySchema): value is TutorialSchema {
  return Array.isArray((value as TutorialSchema).steps);
}

function isMeetingSummary(value: TutorialSchema | MeetingSummarySchema): value is MeetingSummarySchema {
  const typed = value as MeetingSummarySchema;
  return Array.isArray(typed.keyTopics) || Array.isArray(typed.attendees);
}

async function embedShots(doc: PDFDocument, shots: ShotForExport[]) {
  const map = new Map<string, EmbeddedShot>();
  for (const shot of shots) {
    const decoded = decodeDataUrl(shot.dataUrl);
    if (!decoded) continue;

    try {
      const image = decoded.mime.includes("jpeg")
        ? await doc.embedJpg(decoded.bytes)
        : await doc.embedPng(decoded.bytes);
      map.set(shot.id, {
        shot,
        image,
        width: image.width,
        height: image.height,
      });
    } catch {
      // Skip un-embeddable images
    }
  }
  return map;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  try {
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    return { bytes, mime };
  } catch {
    return null;
  }
}
