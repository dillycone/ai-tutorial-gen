// lib/constants/uploads.ts

export const MAX_VIDEO_UPLOAD_BYTES = 600 * 1024 * 1024; // 600 MB
export const MAX_SCREENSHOT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_SCREENSHOT_COUNT = 24;

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/ogg",
]);

export const ALLOWED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mov",
  ".webm",
  ".mkv",
  ".ogv",
]);

export const SCREENSHOT_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,/i;

export const SCREENSHOT_UPLOAD_CONCURRENCY = 4;
