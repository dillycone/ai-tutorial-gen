import { uploadFileToGemini, dataUrlToFile, type GeminiFileRef } from "@/lib/geminiUploads";

export type ShotIn = { id: string; dataUrl: string; timecode: string };

export type UploadedScreenshot = {
  id: string;
  timecode: string;
  name: string;
  uri: string;
  mimeType: string;
};

export async function uploadVideoFile(file: File): Promise<GeminiFileRef> {
  const uploaded = await uploadFileToGemini(file, {
    mimeType: file.type || "video/mp4",
    displayName: file.name || "uploaded_video",
  });
  return uploaded;
}

export async function uploadScreenshots(screenshots: ShotIn[]): Promise<UploadedScreenshot[]> {
  const uploads: UploadedScreenshot[] = [];
  for (const shot of screenshots) {
    let file: File;
    file = dataUrlToFile({
      id: shot.id,
      dataUrl: shot.dataUrl,
      defaultMimeType: "image/png",
      fileName: `${shot.id}.png`,
    });

    const uploaded = await uploadFileToGemini(file, {
      mimeType: file.type || "image/png",
      displayName: file.name,
    });

    uploads.push({
      id: shot.id,
      timecode: shot.timecode,
      ...uploaded,
    });
  }
  return uploads;
}