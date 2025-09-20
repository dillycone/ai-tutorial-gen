import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import type { PDFImage, PDFRef } from "pdf-lib";
import { SchemaType } from "@/lib/types";
import type { ExportOptions, ExportImageOptions, ExportDocumentOptions } from "@/lib/types/api";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Page and style constants
const PAGE_WIDTH = 612; // 8.5in * 72dpi
const PAGE_HEIGHT = 792; // 11in * 72dpi
const PAGE_MARGIN = 64;

// Spacing scale (in points)
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Color palette for text and lines
const COLORS = {
  text: rgb(0, 0, 0),
  muted: rgb(0.35, 0.35, 0.35),
  divider: rgb(0.86, 0.86, 0.86),
  figureBorder: rgb(0.8, 0.8, 0.8),
};

const TITLE_SIZE = 24;
const SUBTITLE_SIZE = 18;
const HEADING_SIZE = 16;
const BODY_SIZE = 12;
const SMALL_SIZE = 11;
const COVER_TITLE_SIZE = 32;

const LINE_GAP = 4;
const FOOTER_SIZE = 10;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BASE_LEADING = 1.35;

function lineHeightFor(size: number) {
  return Math.round(size * BASE_LEADING);
}

// Module-level cache for Noto Sans font bytes to avoid repeated disk reads
const _fontBytesCache: { regular?: Uint8Array; bold?: Uint8Array; italic?: Uint8Array } = {};

/**
 * Load Noto Sans font bytes from public/fonts if available.
 * Returns null if the font file is not present or cannot be read.
 */
async function loadFontBytes(which: "Regular" | "Bold" | "Italic"): Promise<Uint8Array | null> {
  const key = which.toLowerCase() as "regular" | "bold" | "italic";
  if (_fontBytesCache[key]) return _fontBytesCache[key]!;
  try {
    const fontsDir = path.join(process.cwd(), "public", "fonts");
    const filename = `NotoSans-${which}.ttf`;
    const filePath = path.join(fontsDir, filename);
    const bytes = await fs.readFile(filePath);
    _fontBytesCache[key] = bytes;
    return bytes;
  } catch {
    // If fonts are not present, gracefully fall back to StandardFonts
    return null;
  }
}

/**
 * Embed preferred fonts into the PDF document:
 * - Try Noto Sans (Regular/Bold/Italic) when available for better Unicode coverage
 * - Fallback to Standard Helvetica variants when Noto files are missing
 */
async function loadPreferredFonts(doc: PDFDocument) {
  const regBytes = await loadFontBytes("Regular");
  const boldBytes = await loadFontBytes("Bold");
  const italicBytes = await loadFontBytes("Italic");

  const regular = regBytes ? await doc.embedFont(regBytes) : await doc.embedFont(StandardFonts.Helvetica);
  const bold = boldBytes ? await doc.embedFont(boldBytes) : await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = italicBytes ? await doc.embedFont(italicBytes) : await doc.embedFont(StandardFonts.HelveticaOblique);

  return { regular, bold, italic };
}

/**
 * Attempt to parse JSON with several recovery strategies commonly needed for LLM output.
 * - Strips Markdown code fences (```json ... ``` or ``` ... ```)
 * - Normalizes curly/smart quotes to straight quotes
 * - Removes zero-width and NBSP whitespace
 * - Removes trailing commas outside of strings
 * - If still failing, extracts the first object/array slice and retries
 *
 * Returns the parsed value (or null) and the cleaned text used for successful (or final) attempt.
 */
function parseJsonLenient<T = unknown>(text: string): { value: T | null; cleaned: string } {
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  // Initial trim and BOM removal
  let cleaned = (text ?? "").toString().trim().replace(/^\uFEFF/, "");

  // First attempt: raw
  let val = tryParse(cleaned);
  if (val !== null) return { value: val, cleaned };

  // Extract from fenced code block if present
  const fenceMatch =
    cleaned.match(/^\s*```(?:\s*(?:json|js|javascript))?\s*\r?\n([\s\S]*?)\r?\n```/i) ||
    cleaned.match(/^\s*```\s*\r?\n([\s\S]*?)\r?\n```/i);
  if (fenceMatch && typeof fenceMatch[1] === "string") {
    cleaned = fenceMatch[1].trim();
    val = tryParse(cleaned);
    if (val !== null) return { value: val, cleaned };
  } else {
    // Remove single leading/trailing fence lines if they exist
    cleaned = cleaned.replace(/^```[^\n\r]*\r?\n/, "").replace(/\r?\n```$/, "").trim();
  }

  // Normalize smart quotes and invisible whitespace
  cleaned = cleaned
    .replace(/[\u201C\u201D]/g, '"') // double smart quotes
    .replace(/[\u2018\u2019]/g, "'") // single smart quotes
    .replace(/\u00A0/g, " ") // NBSP
    .replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width

  val = tryParse(cleaned);
  if (val !== null) return { value: val, cleaned };

  // Remove trailing commas outside of strings
  const noTrailing = removeTrailingCommas(cleaned);
  val = tryParse(noTrailing);
  if (val !== null) return { value: val, cleaned: noTrailing };

  // As a last resort, try to slice out the first {...} or [...] segment and parse that
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    let slice = cleaned.slice(objStart, objEnd + 1);
    slice = removeTrailingCommas(
      slice.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"),
    );
    val = tryParse(slice);
    if (val !== null) return { value: val, cleaned: slice };
  }

  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    let slice = cleaned.slice(arrStart, arrEnd + 1);
    slice = removeTrailingCommas(
      slice.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"),
    );
    val = tryParse(slice);
    if (val !== null) return { value: val, cleaned: slice };
  }

  return { value: null, cleaned };
}

/**
 * Remove trailing commas that appear right before a closing } or ]
 * while preserving commas inside strings.
 */
function removeTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ",") {
      // Look ahead to see if the next non-whitespace char is a closing brace/bracket
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (j < input.length && (input[j] === "}" || input[j] === "]")) {
        // Skip this comma
        continue;
      }
    }

    out += ch;
  }

  return out;
}

export type ShotForExport = {
  id: string;
  label?: string;
  note?: string;
  timecode: string;
  dataUrl: string;
};

export type ExportBuildArgs = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  resultText: string;
  shots: ShotForExport[];
  options?: ExportOptions;
};

export type ExportResult = {
  buffer: Buffer;
  filename?: string;
  warnings?: string[];
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

type Anchor = {
  title: string;
  level: 1 | 2;
  pageRef: PDFRef;
  y: number;
};

type PdfContext = {
  doc: PDFDocument;
  bold: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  regular: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  italic: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>;
  embeddedShots: Map<string, EmbeddedShot>;
  figureNumbers: Map<string, number>;
  warnings: string[];
  anchors: Anchor[];
  docOptions: ExportDocumentOptions;
};

type PageState = {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

export async function buildPdfBuffer(args: ExportBuildArgs): Promise<ExportResult> {
  const { schemaType, enforceSchema, resultText, shots } = args;

  const doc = await PDFDocument.create();
  const { regular, bold, italic } = await loadPreferredFonts(doc);

  const { embeddedShots, figureNumbers } = await embedShots(doc, shots, args.options?.image);
  const warnings: string[] = [];
  const docOptions: ExportDocumentOptions = {
    includeAppendix: true,
    includeTOC: true,
    includeCover: false,
    ...(args.options?.document ?? {}),
  };
  const ctx: PdfContext = {
    doc,
    bold,
    regular,
    italic,
    embeddedShots,
    figureNumbers,
    warnings,
    anchors: [],
    docOptions,
  };

  let state = addPage(ctx);

  // Decide a running title for footers
  let runningTitle = schemaType === "tutorial" ? "Tutorial Guide" : "Meeting Summary";

  // Lenient JSON parsing to improve robustness against minor formatting issues
  let parsed: TutorialSchema | MeetingSummarySchema | null = null;
  const attempt = parseJsonLenient<TutorialSchema | MeetingSummarySchema>(resultText);
  parsed = attempt.value;

  // Suggested filename based on parsed content
  let suggestedName: string | undefined;

  if (schemaType === "tutorial" && parsed && isTutorial(parsed)) {
    if (parsed.title && parsed.title.trim()) {
      suggestedName = parsed.title.trim();
      runningTitle = parsed.title.trim();
    }
    state = renderTutorial(ctx, state, parsed);
  } else if (schemaType === "meetingSummary" && parsed && isMeetingSummary(parsed)) {
    if (parsed.meetingTitle && parsed.meetingTitle.trim()) {
      suggestedName = parsed.meetingTitle.trim();
      runningTitle = parsed.meetingTitle.trim();
    }
    state = renderMeetingSummary(ctx, state, parsed);
  } else {
    state = renderFallback(ctx, state, resultText, schemaType, enforceSchema);
  }

  if (ctx.docOptions.includeAppendix && ctx.embeddedShots.size > 0) {
    renderShotsAppendix(ctx, state);
  }

  if (ctx.docOptions.includeCover) {
    const coverTitle =
      (ctx.docOptions.runningTitle && ctx.docOptions.runningTitle.trim())
        ? ctx.docOptions.runningTitle.trim()
        : runningTitle;
    renderCoverPage(ctx, coverTitle);
  }

  // Insert a Table of Contents at the beginning if enabled (after cover if present)
  renderTOC(ctx);

  // If a custom running title is provided via options, prefer it over parsed/default
  if (ctx.docOptions.runningTitle && ctx.docOptions.runningTitle.trim()) {
    runningTitle = ctx.docOptions.runningTitle.trim();
  }

  // Add footers with page numbers and running title
  addFooters(ctx, runningTitle);

  // Set document metadata for accessibility and management
  try {
    doc.setProducer("ai-tutorial-gen (pdf-lib)");
  } catch {
    // ignore metadata errors
  }
  try {
    // Use runningTitle as the document title
    doc.setTitle(runningTitle);
  } catch {
    // ignore metadata errors
  }
  if (typeof ctx.docOptions.author === "string" && ctx.docOptions.author.trim()) {
    try {
      doc.setAuthor(ctx.docOptions.author.trim());
    } catch {
      // ignore metadata errors
    }
  }
  if (typeof ctx.docOptions.subject === "string" && ctx.docOptions.subject.trim()) {
    try {
      doc.setSubject(ctx.docOptions.subject.trim());
    } catch {
      // ignore metadata errors
    }
  }
  if (Array.isArray(ctx.docOptions.keywords) && ctx.docOptions.keywords.length > 0) {
    try {
      const kws = ctx.docOptions.keywords
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length > 0);
      if (kws.length > 0) {
        doc.setKeywords(kws);
      }
    } catch {
      // ignore metadata errors
    }
  }
  if (typeof ctx.docOptions.language === "string" && ctx.docOptions.language.trim()) {
    try {
      // Set document language via catalog Lang entry
      ctx.doc.catalog.set(PDFName.of("Lang"), PDFString.of(ctx.docOptions.language.trim()));
    } catch {
      // ignore metadata errors
    }
  }

  const pdfBytes = await doc.save();
  return {
    buffer: Buffer.from(pdfBytes),
    filename: suggestedName,
    warnings: warnings.length ? warnings : undefined,
  };
}

function renderTutorial(ctx: PdfContext, state: PageState, tutorial: TutorialSchema) {
  state = drawTitle(ctx, state, tutorial.title || "Tutorial Guide");
  if (tutorial.summary) {
    state = drawParagraph(ctx, state, tutorial.summary, BODY_SIZE);
  }

  if (Array.isArray(tutorial.prerequisites) && tutorial.prerequisites.length) {
    state = drawHeading(ctx, state, "Prerequisites", HEADING_SIZE);
    state = drawBulletedList(ctx, state, tutorial.prerequisites);
  }

  if (Array.isArray(tutorial.steps)) {
    tutorial.steps.forEach((step, index) => {
      state = drawHeading(
        ctx,
        state,
        `Step ${step.index ?? index + 1}: ${step.title ?? "Untitled Step"}`,
        SUBTITLE_SIZE,
        { keepNextLines: 3, marginTop: SP.xl, marginBottom: SP.sm },
      );
      if (step.description) {
        state = drawParagraph(ctx, state, step.description, BODY_SIZE);
      }

      if (step.startTimecode || step.endTimecode) {
        const timing: string[] = [];
        if (step.startTimecode) timing.push(`Start: ${step.startTimecode}`);
        if (step.endTimecode) timing.push(`End: ${step.endTimecode}`);
        state = drawMeta(ctx, state, timing.join(" · "));
      }

      if (Array.isArray(step.screenshotIds) && step.screenshotIds.length > 0) {
        step.screenshotIds.forEach((shotId) => {
          state = drawFigure(ctx, state, shotId);
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
    state = drawMeta(ctx, state, meta.join(" · "));
  }

  if (summary.summary) {
    state = drawParagraph(ctx, state, summary.summary, BODY_SIZE);
  }

  if (Array.isArray(summary.attendees) && summary.attendees.length) {
    state = drawHeading(ctx, state, "Attendees", HEADING_SIZE, { marginTop: SP.lg });
    const attendeeLines = summary.attendees.map((attendee) =>
      [attendee.name, attendee.role, attendee.department].filter(Boolean).join(" · ")
    );
    state = drawBulletedList(ctx, state, attendeeLines);
  }

  if (Array.isArray(summary.keyTopics) && summary.keyTopics.length) {
    state = drawHeading(ctx, state, "Key Topics", HEADING_SIZE, { marginTop: SP.lg });
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
          state = drawMeta(ctx, state, metaLine);
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
    state = drawHeading(ctx, state, "Follow Ups", HEADING_SIZE, { marginTop: SP.lg });
    state = drawBulletedList(ctx, state, summary.followUps);
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

  // Render figures in ascending figure number order
  const orderedIds = Array.from(ctx.figureNumbers.entries())
    .sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))
    .map(([id]) => id);

  for (const shotId of orderedIds) {
    state = drawFigure(ctx, state, shotId);
  }
  return state;
}

function renderCoverPage(ctx: PdfContext, title: string) {
  // Insert at index 0 so it becomes the first page of the document
  const page = ctx.doc.insertPage(0, [PAGE_WIDTH, PAGE_HEIGHT]);

  const centerX = PAGE_WIDTH / 2;
  let y = PAGE_HEIGHT - PAGE_MARGIN * 1.75;

  // Title (large, centered, bold)
  try {
    const titleText = title && title.trim() ? title.trim() : "Document";
    const tWidth = ctx.bold.widthOfTextAtSize(titleText, COVER_TITLE_SIZE);
    page.drawText(titleText, {
      x: Math.max(PAGE_MARGIN, centerX - tWidth / 2),
      y,
      font: ctx.bold,
      size: COVER_TITLE_SIZE,
      color: COLORS.text,
    });
    y -= COVER_TITLE_SIZE + SP.xl * 1.25;
  } catch {
    // No-op on font measurement errors
  }

  // Optional hero image: use the first available screenshot (Figure #1) if present
  let heroPlaced = false;
  try {
    let firstId: string | null = null;
    // Prefer figure number 1; otherwise choose the smallest number
    for (const [id, no] of ctx.figureNumbers.entries()) {
      if (no === 1) {
        firstId = id;
        break;
      }
    }
    if (!firstId && ctx.figureNumbers.size > 0) {
      firstId = Array.from(ctx.figureNumbers.entries()).sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0))[0][0];
    }

    if (firstId) {
      const emb = ctx.embeddedShots.get(firstId);
      if (emb) {
        const maxW = CONTENT_WIDTH;
        const maxH = Math.floor(PAGE_HEIGHT * 0.45);
        const s = Math.min(1, Math.min(maxW / emb.width, maxH / emb.height));
        const w = Math.max(1, Math.floor(emb.width * s));
        const h = Math.max(1, Math.floor(emb.height * s));
        const x = PAGE_MARGIN + (CONTENT_WIDTH - w) / 2;
        const imgY = Math.max(PAGE_MARGIN + 200, y - h);

        // Subtle border
        page.drawRectangle({
          x: x - 2,
          y: imgY - 2,
          width: w + 4,
          height: h + 4,
          borderColor: COLORS.figureBorder,
          borderWidth: 1,
        });

        page.drawImage(emb.image, { x, y: imgY, width: w, height: h });
        y = imgY - SP.lg;
        heroPlaced = true;
      }
    }
  } catch {
    // Ignore image placement issues on cover
  }

  // Metadata block (centered): author, subject, generation date
  try {
    const lines: string[] = [];
    if (typeof ctx.docOptions.author === "string" && ctx.docOptions.author.trim()) {
      lines.push(`Author: ${ctx.docOptions.author.trim()}`);
    }
    if (typeof ctx.docOptions.subject === "string" && ctx.docOptions.subject.trim()) {
      lines.push(`Subject: ${ctx.docOptions.subject.trim()}`);
    }
    const dateText = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    lines.push(`Generated on ${dateText}`);

    if (!heroPlaced) {
      y -= SP.xl * 1.5;
    } else {
      y -= SP.md;
    }

    for (const line of lines) {
      const w = ctx.regular.widthOfTextAtSize(line, BODY_SIZE);
      page.drawText(line, {
        x: Math.max(PAGE_MARGIN, centerX - w / 2),
        y,
        font: ctx.regular,
        size: BODY_SIZE,
        color: COLORS.muted,
      });
      y -= lineHeightFor(BODY_SIZE);
    }
  } catch {
    // Ignore metadata drawing errors
  }
}

/**
 * Add a clickable internal link (GoTo) annotation to a page rect that jumps to a specific y on a target page.
 * Gracefully no-ops on any low-level PDF errors.
 */
function addGoToLink(
  ctx: PdfContext,
  page: ReturnType<PDFDocument["addPage"]>,
  rect: { x: number; y: number; width: number; height: number },
  targetPageRef: PDFRef,
  targetY: number,
) {
  try {
    const { x, y, width, height } = rect;
    const annot = ctx.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      // Destination array: [pageRef, /XYZ, left, top, zoom]
      Dest: [targetPageRef, "XYZ", 0, targetY, null],
    });
    const annotRef = ctx.doc.context.register(annot);
    page.node.addAnnot(annotRef);
  } catch {
    // Avoid failing export due to link annotation issues
  }
}

/**
 * Add an external URI link annotation over a rectangle.
 * Gracefully no-ops on any low-level PDF errors.
 */
function addUriLink(
  ctx: PdfContext,
  page: ReturnType<PDFDocument["addPage"]>,
  rect: { x: number; y: number; width: number; height: number },
  url: string,
) {
  try {
    const { x, y, width, height } = rect;
    const annot = ctx.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: ctx.doc.context.obj({
        Type: "Action",
        S: "URI",
        URI: url,
      }),
    });
    const annotRef = ctx.doc.context.register(annot);
    page.node.addAnnot(annotRef);
  } catch {
    // Avoid failing export due to link annotation issues
  }
}

/**
 * Truncate a string with ellipsis so its rendered width does not exceed maxWidth.
 */
function truncateToFit(
  font: Awaited<ReturnType<PDFDocument["embedStandardFont"]>>,
  size: number,
  text: string,
  maxWidth: number,
) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ell = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ell;
    const w = font.widthOfTextAtSize(candidate, size);
    if (w <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  const len = Math.max(1, lo - 1);
  return text.slice(0, len) + ell;
}

/**
 * Insert and render a Table of Contents at the start of the document, with clickable entries.
 * - Uses anchors collected from drawTitle/drawHeading
 * - Avoids page number instability by inserting required TOC pages first
 */
function renderTOC(ctx: PdfContext) {
  const includeTOC = ctx.docOptions?.includeTOC !== false;
  if (!includeTOC) return;

  const anchors = (ctx.anchors || []).filter((a) => a && typeof a.title === "string" && a.title.trim().length > 0);
  if (anchors.length === 0) return;

  const lineH = lineHeightFor(BODY_SIZE);
  const titleBlock = TITLE_SIZE + LINE_GAP * 2;

  // Compute page capacities for TOC pages
  const firstUsable = (PAGE_HEIGHT - PAGE_MARGIN) - (PAGE_MARGIN + titleBlock);
  const linesFirst = Math.max(0, Math.floor(firstUsable / lineH));
  const linesPerNext = Math.max(1, Math.floor((PAGE_HEIGHT - 2 * PAGE_MARGIN) / lineH));

  const firstCount = Math.min(anchors.length, linesFirst);
  const remaining = Math.max(0, anchors.length - firstCount);
  const extraPages = remaining > 0 ? Math.ceil(remaining / linesPerNext) : 0;
  const totalTocPages = 1 + extraPages;

  const startIndex = ctx.docOptions?.includeCover ? 1 : 0;

  // Insert TOC pages up front (after cover if present) to stabilize target page numbers
  const tocPages: ReturnType<PDFDocument["addPage"]>[] = [];
  for (let i = 0; i < totalTocPages; i++) {
    tocPages.push(ctx.doc.insertPage(startIndex + i, [PAGE_WIDTH, PAGE_HEIGHT]));
  }

  // Draw title on first TOC page
  let tocPageIndex = 0;
  let page = tocPages[tocPageIndex];
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  page.drawText("Table of Contents", {
    x: PAGE_MARGIN,
    y,
    font: ctx.bold,
    size: TITLE_SIZE,
    color: COLORS.text,
  });
  y -= titleBlock;

  const drawEntry = (entryText: string, level: 1 | 2, targetRef: PDFRef, targetY: number) => {
    // Page break if needed
    if (y - lineH <= PAGE_MARGIN) {
      tocPageIndex += 1;
      page = tocPages[tocPageIndex] ?? ctx.doc.insertPage(startIndex + tocPageIndex, [PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - PAGE_MARGIN;
    }

    const indent = level >= 2 ? 16 : 0;
    const maxTextW = CONTENT_WIDTH - indent;
    const text = truncateToFit(ctx.regular, BODY_SIZE, entryText, maxTextW);

    page.drawText(text, {
      x: PAGE_MARGIN + indent,
      y,
      font: ctx.regular,
      size: BODY_SIZE,
      color: COLORS.text,
    });

    // Clickable area for the full line
    addGoToLink(
      ctx,
      page,
      { x: PAGE_MARGIN + indent, y, width: CONTENT_WIDTH - indent, height: lineH },
      targetRef,
      targetY,
    );

    y -= lineH;
  };

  for (const a of anchors) {
    drawEntry(a.title, a.level, a.pageRef, a.y);
  }
}

function addFooters(ctx: PdfContext, title?: string) {
  const pages = ctx.doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    if (ctx.docOptions?.includeCover && i === 0) {
      continue;
    }

    const page = pages[i];
    const dividerY = 36;
    const textY = 28;
    const num = `${i + 1}/${pages.length}`;
    const numWidth = ctx.regular.widthOfTextAtSize(num, FOOTER_SIZE);

    // Subtle divider above footer text
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: dividerY,
      width: CONTENT_WIDTH,
      height: 0.6,
      fillColor: COLORS.divider,
    });

    if (title) {
      page.drawText(title, {
        x: PAGE_MARGIN,
        y: textY,
        font: ctx.regular,
        size: FOOTER_SIZE,
        color: COLORS.muted,
      });
    }

    page.drawText(num, {
      x: PAGE_WIDTH - PAGE_MARGIN - numWidth,
      y: textY,
      font: ctx.regular,
      size: FOOTER_SIZE,
      color: COLORS.muted,
    });
  }
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

function ensureSpaceForGroup(ctx: PdfContext, state: PageState, requiredHeight: number) {
  if (state.y - requiredHeight <= PAGE_MARGIN) {
    return addPage(ctx);
  }
  return state;
}

function drawFigure(ctx: PdfContext, state: PageState, shotId: string) {
  const entry = ctx.embeddedShots.get(shotId);
  if (!entry) {
    ctx.warnings.push(`Missing screenshot asset for id "${shotId}".`);
    // Render a subtle placeholder note to preserve context
    return drawMeta(ctx, state, `Missing screenshot (${shotId})`);
  }

  const figNo = ctx.figureNumbers.get(shotId) ?? 0;
  const baseTitle =
    entry.shot.label && entry.shot.label.trim()
      ? entry.shot.label.trim()
      : (figNo ? `Screenshot ${figNo}` : "Screenshot");
  const time = entry.shot.timecode ? ` (${entry.shot.timecode})` : "";
  const labelText = `Figure ${figNo || ""}${figNo ? ": " : ""}${baseTitle}${time}`;
  const captionText = entry.shot.note && entry.shot.note.trim() ? entry.shot.note.trim() : "";

  // Measure label and caption to compute total block height.
  const labelH = measureParagraphHeight(ctx, labelText, SMALL_SIZE, ctx.bold);
  const captionH = captionText ? measureParagraphHeight(ctx, captionText, SMALL_SIZE, ctx.italic) : 0;

  // Spacing within the figure block
  const gapAfterLabel = SP.sm;
  const gapBeforeCaption = captionText ? SP.xs : 0;
  const bottomMargin = SP.md;

  // First pass: compute image scale with current page space.
  const widthScale = Math.min(1, CONTENT_WIDTH / entry.width);
  const nonImageSpace = labelH + gapAfterLabel + gapBeforeCaption + captionH + bottomMargin;
  let availableForImage = state.y - PAGE_MARGIN - nonImageSpace;
  let scale = availableForImage > 0 ? Math.min(widthScale, availableForImage / entry.height) : widthScale;
  let imgW = entry.width * scale;
  let imgH = entry.height * scale;

  // Compute full block height
  let blockH = labelH + gapAfterLabel + imgH + (captionText ? gapBeforeCaption + captionH : 0) + bottomMargin;

  // If the whole block won't fit, add a page and recalc with fresh space.
  if (state.y - blockH <= PAGE_MARGIN) {
    state = addPage(ctx);
    availableForImage = state.y - PAGE_MARGIN - nonImageSpace;
    scale = Math.min(widthScale, Math.max(0, availableForImage) / entry.height);
    imgW = entry.width * scale;
    imgH = entry.height * scale;
    blockH = labelH + gapAfterLabel + imgH + (captionText ? gapBeforeCaption + captionH : 0) + bottomMargin;
  }

  // Ensure space for the entire block to avoid overlays.
  state = ensureSpaceForGroup(ctx, state, blockH);

  // Draw label (bold, small) with wrapping
  const labelLines = wrapText(labelText, ctx.bold, SMALL_SIZE, CONTENT_WIDTH);
  for (const line of labelLines) {
    state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
    state.page.drawText(line, {
      x: PAGE_MARGIN,
      y: state.y,
      font: ctx.bold,
      size: SMALL_SIZE,
      color: COLORS.text,
    });
    state.y -= lineHeightFor(SMALL_SIZE);
  }

  // Gap between label and image
  state.y -= gapAfterLabel;

  // Draw image with subtle border, centered
  const imgX = PAGE_MARGIN + (CONTENT_WIDTH - imgW) / 2;
  const imgY = state.y - imgH;

  state.page.drawRectangle({
    x: imgX - 2,
    y: imgY - 2,
    width: imgW + 4,
    height: imgH + 4,
    borderColor: COLORS.figureBorder,
    borderWidth: 1,
  });

  state.page.drawImage(entry.image, {
    x: imgX,
    y: imgY,
    width: imgW,
    height: imgH,
  });
  state.y -= imgH;

  // Caption (italic, muted)
  if (captionText) {
    state.y -= gapBeforeCaption;
    const captionLines = wrapText(captionText, ctx.italic, SMALL_SIZE, CONTENT_WIDTH);
    for (const line of captionLines) {
      state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: state.y,
        font: ctx.italic,
        size: SMALL_SIZE,
        color: COLORS.muted,
      });
      state.y -= lineHeightFor(SMALL_SIZE);
    }
  }

  // Bottom margin after figure
  state.y -= bottomMargin;

  return state;
}

function drawTitle(ctx: PdfContext, state: PageState, text: string) {
  state = ensureSpace(ctx, state, TITLE_SIZE + LINE_GAP * 2);
  const anchorY = state.y;
  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size: TITLE_SIZE,
    color: rgb(0, 0, 0),
  });
  // Record anchor for TOC navigation (treat title as level 1)
  try {
    ctx.anchors.push({ title: text, level: 1, pageRef: state.page.ref, y: anchorY });
  } catch {
    // ignore anchor recording issues
  }
  state.y -= TITLE_SIZE + LINE_GAP * 2;
  return state;
}

function drawHeading(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: { keepNextLines?: number; marginTop?: number; marginBottom?: number } = {},
) {
  const keepNext = options.keepNextLines ?? (size >= SUBTITLE_SIZE ? 3 : 2);
  const marginTop = options.marginTop ?? (size >= SUBTITLE_SIZE ? SP.xl : SP.lg);
  const marginBottom = options.marginBottom ?? SP.sm;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const reserve = lineHeightFor(size) + keepNext * lineHeightFor(BODY_SIZE) + SP.sm;
  state = ensureSpaceForGroup(ctx, state, reserve);

  const anchorY = state.y;
  state.page.drawText(text, {
    x: PAGE_MARGIN,
    y: state.y,
    font: ctx.bold,
    size,
    color: COLORS.text,
  });

  // Record anchor for TOC: major headings as level 1 (SUBTITLE_SIZE or larger), others as level 2
  try {
    const level: 1 | 2 = size >= SUBTITLE_SIZE ? 1 : 2;
    ctx.anchors.push({ title: text, level, pageRef: state.page.ref, y: anchorY });
  } catch {
    // ignore anchor recording issues
  }

  state.y -= lineHeightFor(size);

  if (marginBottom) {
    state.y -= marginBottom;
  }
  return state;
}

function drawParagraph(
  ctx: PdfContext,
  state: PageState,
  text: string,
  size: number,
  options: {
    bold?: boolean;
    keepTogether?: boolean;
    marginTop?: number;
    marginBottom?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  const font = options.bold ? ctx.bold : ctx.regular;
  const color = options.color ?? COLORS.text;
  const marginTop = options.marginTop ?? 0;
  const marginBottom = options.marginBottom ?? SP.sm;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const paragraphs = text.split(/\n+/).filter(Boolean);

  paragraphs.forEach((paragraph, pIndex) => {
    const lines = wrapText(paragraph, font, size, CONTENT_WIDTH);
    const blockHeight = lines.length * lineHeightFor(size);

    if (options.keepTogether) {
      state = ensureSpaceForGroup(ctx, state, blockHeight);
    }
    for (const line of lines) {
      state = ensureSpace(ctx, state, lineHeightFor(size));
      const lineY = state.y;
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: lineY,
        font,
        size,
        color,
      });

      // Linkify URLs on this line if enabled
      if (ctx.docOptions.linkifyUrls !== false) {
        try {
          const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]{}"']+/gi;
          let match: RegExpExecArray | null;
          while ((match = URL_RE.exec(line)) !== null) {
            const url = match[0];
            // Trim trailing punctuation that is commonly not part of URL
            const trimmed = url.replace(/[).,!?:;\]]+$/g, "");
            const before = line.slice(0, match.index);
            const x = PAGE_MARGIN + font.widthOfTextAtSize(before, size);
            const w = font.widthOfTextAtSize(trimmed, size);
            if (w > 0) {
              addUriLink(ctx, state.page, { x, y: lineY, width: w, height: lineHeightFor(size) }, trimmed);
            }
          }
        } catch {
          // ignore linkification errors
        }
      }

      state.y -= lineHeightFor(size);
    }
    if (pIndex !== paragraphs.length - 1) {
      state.y -= SP.xs;
    }
  });

  if (marginBottom) {
    state.y -= marginBottom;
  }

  return state;
}

function drawMeta(
  ctx: PdfContext,
  state: PageState,
  text: string,
  options: { italic?: boolean; marginTop?: number; marginBottom?: number } = {},
) {
  const useItalic = options.italic ?? true;
  const font = useItalic ? ctx.italic : ctx.regular;
  const marginTop = options.marginTop ?? 0;
  const marginBottom = options.marginBottom ?? SP.sm;
  const color = COLORS.muted;

  if (state.y < PAGE_HEIGHT - PAGE_MARGIN && marginTop) {
    state.y -= marginTop;
  }

  const paragraphs = text.split(/\n+/).filter(Boolean);
  for (let p = 0; p < paragraphs.length; p++) {
    const lines = wrapText(paragraphs[p], font, SMALL_SIZE, CONTENT_WIDTH);
    for (const line of lines) {
      state = ensureSpace(ctx, state, lineHeightFor(SMALL_SIZE));
      const lineY = state.y;
      state.page.drawText(line, {
        x: PAGE_MARGIN,
        y: lineY,
        font,
        size: SMALL_SIZE,
        color,
      });

      if (ctx.docOptions.linkifyUrls !== false) {
        try {
          const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]{}"']+/gi;
          let match: RegExpExecArray | null;
          while ((match = URL_RE.exec(line)) !== null) {
          const url = match[0];
            const trimmed = url.replace(/[).,!?:;\]]+$/g, "");
            const before = line.slice(0, match.index);
            const x = PAGE_MARGIN + font.widthOfTextAtSize(before, SMALL_SIZE);
            const w = font.widthOfTextAtSize(trimmed, SMALL_SIZE);
            if (w > 0) {
              addUriLink(ctx, state.page, { x, y: lineY, width: w, height: lineHeightFor(SMALL_SIZE) }, trimmed);
            }
          }
        } catch {
          // ignore linkification errors
        }
      }

      state.y -= lineHeightFor(SMALL_SIZE);
    }
    if (p < paragraphs.length - 1) {
      state.y -= SP.xs;
    }
  }

  if (marginBottom) {
    state.y -= marginBottom;
  }

  return state;
}

function drawBulletedList(
  ctx: PdfContext,
  state: PageState,
  items: string[],
  options: {
    size?: number;
    indent?: number;
    bullet?: string;
    gap?: number;
    color?: ReturnType<typeof rgb>;
  } = {},
) {
  const size = options.size ?? BODY_SIZE;
  const indent = options.indent ?? 14;
  const bullet = options.bullet ?? "•";
  const gap = options.gap ?? SP.xs;
  const color = options.color ?? COLORS.text;
  const font = ctx.regular;

  const textX = PAGE_MARGIN + indent;
  const maxTextWidth = CONTENT_WIDTH - indent;

  for (const raw of items) {
    const item = String(raw ?? "").trim();
    if (!item) continue;

    const lines = wrapText(item, font, size, maxTextWidth);

    state = ensureSpace(ctx, state, lineHeightFor(size));

    // Draw bullet
    state.page.drawText(bullet, {
      x: PAGE_MARGIN,
      y: state.y,
      font,
      size,
      color,
    });

    if (lines.length > 0) {
      const lineY = state.y;
      const first = lines[0];
      state.page.drawText(first, {
        x: textX,
        y: lineY,
        font,
        size,
        color,
      });

      if (ctx.docOptions.linkifyUrls !== false) {
        try {
          const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]{}"']+/gi;
          let match: RegExpExecArray | null;
          while ((match = URL_RE.exec(first)) !== null) {
            const url = match[0];
            const trimmed = url.replace(/[).,!?:;\]]+$/g, "");
            const before = first.slice(0, match.index);
            const x = textX + font.widthOfTextAtSize(before, size);
            const w = font.widthOfTextAtSize(trimmed, size);
            if (w > 0) {
              addUriLink(ctx, state.page, { x, y: lineY, width: w, height: lineHeightFor(size) }, trimmed);
            }
          }
        } catch {
          // ignore
        }
      }

      state.y -= lineHeightFor(size);
    }

    for (let i = 1; i < lines.length; i++) {
      state = ensureSpace(ctx, state, lineHeightFor(size));
      const line = lines[i];
      const contY = state.y;
      state.page.drawText(line, {
        x: textX,
        y: contY,
        font,
        size,
        color,
      });

      if (ctx.docOptions.linkifyUrls !== false) {
        try {
          const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]{}"']+/gi;
          let match: RegExpExecArray | null;
          while ((match = URL_RE.exec(line)) !== null) {
            const url = match[0];
            const trimmed = url.replace(/[).,!?:;\]]+$/g, "");
            const before = line.slice(0, match.index);
            const x = textX + font.widthOfTextAtSize(before, size);
            const w = font.widthOfTextAtSize(trimmed, size);
            if (w > 0) {
              addUriLink(ctx, state.page, { x, y: contY, width: w, height: lineHeightFor(size) }, trimmed);
            }
          }
        } catch {
          // ignore
        }
      }

      state.y -= lineHeightFor(size);
    }

    state.y -= gap;
  }

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

  const rawTokens = text.split(/\s+/);
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
  return lines * lineHeightFor(size) + (paragraphs.length > 1 ? (paragraphs.length - 1) * LINE_GAP : 0);
}

function isTutorial(value: TutorialSchema | MeetingSummarySchema): value is TutorialSchema {
  return Array.isArray((value as TutorialSchema).steps);
}

function isMeetingSummary(value: TutorialSchema | MeetingSummarySchema): value is MeetingSummarySchema {
  const typed = value as MeetingSummarySchema;
  return Array.isArray(typed.keyTopics) || Array.isArray(typed.attendees);
}

async function embedShots(doc: PDFDocument, shots: ShotForExport[], imgOpts?: ExportImageOptions) {
  const embeddedShots = new Map<string, EmbeddedShot>();
  const figureNumbers = new Map<string, number>();
  let n = 1;

  for (const shot of shots) {
    const decoded = decodeDataUrl(shot.dataUrl);
    if (!decoded) continue;

    try {
      let bytes = decoded.bytes;
      let mime = decoded.mime;

      if (imgOpts) {
        try {
          let pipeline = sharp(bytes, { failOn: "none" }).rotate();
          if (imgOpts.maxWidth || imgOpts.maxHeight) {
            pipeline = pipeline.resize({
              width: imgOpts.maxWidth,
              height: imgOpts.maxHeight ?? undefined,
              fit: "inside",
              withoutEnlargement: true,
            });
          }
          const fmt = imgOpts.format ?? "jpeg";
          if (fmt === "jpeg") {
            const q = Math.max(0, Math.min(1, typeof imgOpts.quality === "number" ? imgOpts.quality : 0.82));
            pipeline = pipeline.jpeg({
              quality: Math.round(q * 100),
              progressive: imgOpts.progressive ?? true,
              chromaSubsampling: "4:4:4",
            });
            bytes = await pipeline.toBuffer();
            mime = "image/jpeg";
          } else {
            pipeline = pipeline.png();
            bytes = await pipeline.toBuffer();
            mime = "image/png";
          }
        } catch {
          // If sharp processing fails, fall back to original bytes/mime
        }
      }

      const lower = mime.toLowerCase();
      const image = lower.includes("jpeg") || lower.includes("jpg")
        ? await doc.embedJpg(bytes)
        : await doc.embedPng(bytes);

      embeddedShots.set(shot.id, {
        shot,
        image,
        width: image.width,
        height: image.height,
      });
      figureNumbers.set(shot.id, n++);
    } catch {
      // Skip un-embeddable images; downstream render will warn on missing asset
    }
  }
  return { embeddedShots, figureNumbers };
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