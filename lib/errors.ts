// lib/errors.ts
export function getErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && err.message) {
    return String(err.message);
  }
  return fallback;
}
