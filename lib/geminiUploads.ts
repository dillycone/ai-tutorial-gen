// lib/geminiUploads.ts
import { ai } from "@/lib/gemini";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

export async function uploadFileToGemini(file: File, { mimeType, displayName }: UploadConfig): Promise<GeminiFileRef> {
  const uploaded = (await ai.files.upload({
    file,
    config: {
      mimeType,
      displayName,
    },
  })) as GeminiFileHandle;

  return waitUntilActive(uploaded);
}

export async function waitUntilActive(fileHandle: GeminiFileHandle): Promise<GeminiFileRef> {
  let current = fileHandle;
  while (current.state && current.state !== "ACTIVE") {
    await sleep(3000);
    current = (await ai.files.get({ name: current.name })) as GeminiFileHandle;
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
};

export function dataUrlToFile({ id, dataUrl, defaultMimeType = "application/octet-stream", fileName }: DataUrlToFileOptions) {
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

  const extension = mimeType.split("/")[1] ?? "bin";
  const resolvedName = fileName ?? `${id}.${extension}`;

  return new File([new Uint8Array(buffer)], resolvedName, { type: mimeType });
}
