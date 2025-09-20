import {
  uploadFileToGemini,
  dataUrlToFile,
  type GeminiFileRef,
} from "@/lib/geminiUploads";
import {
  MAX_SCREENSHOT_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  SCREENSHOT_UPLOAD_CONCURRENCY,
} from "@/lib/constants/uploads";

export type ShotIn = { id: string; dataUrl: string; timecode: string };

export type UploadedScreenshot = {
  id: string;
  timecode: string;
  name: string;
  uri: string;
  mimeType: string;
};

export async function uploadVideoFile(file: File): Promise<GeminiFileRef> {
  if (typeof file.size === "number" && file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error(
      `Video exceeds ${(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB upload limit`,
    );
  }
  if (typeof file.size === "number" && file.size <= 0) {
    throw new Error("Video file is empty");
  }

  const uploaded = await uploadFileToGemini(file, {
    mimeType: file.type || "video/mp4",
    displayName: file.name || "uploaded_video",
  });
  return uploaded;
}

export async function uploadScreenshots(screenshots: ShotIn[]): Promise<UploadedScreenshot[]> {
  if (screenshots.length === 0) {
    return [];
  }

  const concurrency = Math.min(
    Math.max(1, SCREENSHOT_UPLOAD_CONCURRENCY),
    screenshots.length,
  );
  const results: UploadedScreenshot[] = new Array(screenshots.length);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= screenshots.length) break;
      const shot = screenshots[index];
      const file = dataUrlToFile({
        id: shot.id,
        dataUrl: shot.dataUrl,
        defaultMimeType: "image/png",
        fileName: `${shot.id}.png`,
        maxBytes: MAX_SCREENSHOT_UPLOAD_BYTES,
      });

      const uploaded = await uploadFileToGemini(file, {
        mimeType: file.type || "image/png",
        displayName: file.name,
      });

      results[index] = {
        id: shot.id,
        timecode: shot.timecode,
        ...uploaded,
      };
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}