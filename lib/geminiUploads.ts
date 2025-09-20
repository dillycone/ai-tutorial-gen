// lib/geminiUploads.ts
import { ai } from "@/lib/gemini";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TERMINAL_STATES = new Set(["FAILED", "ERROR", "DELETED", "EXPIRED"]);

export type WaitOptions = {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
};

type GeminiFileHandle = {
  name: string;
  uri: string;
  mimeType: string;
  state?: string;
};

type UploadConfig = {
  mimeType: string;
  displayName: string;
};

export type GeminiFileRef = {
  name: string;
  uri: string;
  mimeType: string;
};

export async function uploadFileToGemini(
  file: File,
  { mimeType, displayName }: UploadConfig,
  waitOptions?: WaitOptions,
): Promise<GeminiFileRef> {
  const uploaded = (await ai.files.upload({
    file,
    config: {
      mimeType,
      displayName,
    },
  })) as GeminiFileHandle;

  return waitUntilActive(uploaded, waitOptions);
}

export async function waitUntilActive(
  fileHandle: GeminiFileHandle,
  options: WaitOptions = {},
): Promise<GeminiFileRef> {
  const pollIntervalMs = Math.max(500, options.pollIntervalMs ?? 3000);
  const maxWaitMs = Math.max(pollIntervalMs, options.maxWaitMs ?? 60_000);
  const deadline = Date.now() + maxWaitMs;

  let current = fileHandle;
  while (current.state && current.state !== "ACTIVE") {
    if (TERMINAL_STATES.has(current.state)) {
      throw new Error(`Gemini upload ${current.name} failed with state ${current.state}`);
    }

    if (options.signal?.aborted) {
      throw new Error(`Aborted while waiting for Gemini upload ${current.name}`);
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for Gemini upload ${current.name} to activate`);
    }

    await sleep(pollIntervalMs);
    current = (await ai.files.get({ name: current.name })) as GeminiFileHandle;
  }

  if (!current.uri) {
    throw new Error(`Gemini upload ${current.name} is missing a file URI`);
  }

  return {
    name: current.name,
    uri: current.uri,
    mimeType: current.mimeType,
  };
}

type DataUrlToFileOptions = {
  id: string;
  dataUrl: string;
  defaultMimeType?: string;
  fileName?: string;
  maxBytes?: number;
};

const bytesToMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

export function dataUrlToFile({
  id,
  dataUrl,
  defaultMimeType = "application/octet-stream",
  fileName,
  maxBytes,
}: DataUrlToFileOptions) {
  const [metadata, payload] = dataUrl.split(",");
  if (!payload) {
    throw new Error(`Invalid data URL for ${id}`);
  }
  if (!metadata?.startsWith("data:")) {
    throw new Error(`Unsupported data URL format for ${id}`);
  }

  const mimeMatch = metadata.match(/^data:([^;]+);base64$/);
  const mimeType = mimeMatch?.[1] ?? defaultMimeType;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(payload, "base64");
  } catch {
    throw new Error(`Could not decode data URL for ${id}`);
  }

  if (typeof maxBytes === "number" && buffer.byteLength > maxBytes) {
    throw new Error(
      `Asset ${id} is ${bytesToMb(buffer.byteLength)}MB but limit is ${bytesToMb(maxBytes)}MB`,
    );
  }

  const extension = mimeType.split("/")[1] ?? "bin";
  const resolvedName = fileName ?? `${id}.${extension}`;

  return new File([new Uint8Array(buffer)], resolvedName, { type: mimeType });
}
