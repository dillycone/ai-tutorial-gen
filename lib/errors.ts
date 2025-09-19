// lib/errors.ts

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const NODE_ENV = (typeof process !== "undefined" ? process.env.NODE_ENV : "production") || "production";
const IS_PROD = NODE_ENV === "production";

const RAW_LOG_LEVEL = (typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined)?.toLowerCase() as LogLevel | undefined;
const LOG_LEVEL: LogLevel = RAW_LOG_LEVEL && ["debug", "info", "warn", "error"].includes(RAW_LOG_LEVEL)
  ? RAW_LOG_LEVEL
  : ("info" as LogLevel);

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[LOG_LEVEL];
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

type ConsoleLike = {
  debug: (message?: any, ...optionalParams: any[]) => void;
  info: (message?: any, ...optionalParams: any[]) => void;
  warn: (message?: any, ...optionalParams: any[]) => void;
  error: (message?: any, ...optionalParams: any[]) => void;
};

const con: ConsoleLike =
  typeof console !== "undefined"
    ? console
    : {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };

// Structured application error with code and status
export class AppError extends Error {
  code?: string;
  status?: number;
  cause?: unknown;

  constructor(message: string, opts?: { code?: string; status?: number; cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = opts?.code;
    this.status = opts?.status;
    this.cause = opts?.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "VALIDATION_ERROR", status: 400, cause: opts?.cause });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "UNAUTHORIZED", status: 401, cause: opts?.cause });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "FORBIDDEN", status: 403, cause: opts?.cause });
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "NOT_FOUND", status: 404, cause: opts?.cause });
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "CONFLICT", status: 409, cause: opts?.cause });
  }
}
export class RateLimitError extends AppError {
  constructor(message = "Rate limited", opts?: { code?: string; cause?: unknown }) {
    super(message, { code: opts?.code ?? "RATE_LIMITED", status: 429, cause: opts?.cause });
  }
}
export class ExternalServiceError extends AppError {
  constructor(message = "Upstream service error", opts?: { code?: string; status?: number; cause?: unknown }) {
    super(message, { code: opts?.code ?? "EXTERNAL_SERVICE_ERROR", status: opts?.status ?? 502, cause: opts?.cause });
  }
}

export type ErrorPayload = {
  message: string;
  code?: string;
  status?: number;
  stack?: string;
  cause?: string;
};

/**
 * Convert unknown errors into a consistent payload for logs or API responses.
 * In production, stack traces and detailed causes are omitted by default.
 */
export function formatError(err: unknown, fallback = "Unexpected error"): ErrorPayload {
  if (err instanceof AppError) {
    return {
      message: err.message || fallback,
      code: err.code,
      status: err.status,
      stack: IS_PROD ? undefined : err.stack,
      cause: IS_PROD ? undefined : toSimpleString(err.cause),
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message || fallback,
      status: undefined,
      code: undefined,
      stack: IS_PROD ? undefined : err.stack,
      cause: IS_PROD ? undefined : undefined,
    };
  }
  if (typeof err === "string") {
    return { message: err || fallback };
  }
  // Unknown/opaque error
  return { message: fallback, stack: IS_PROD ? undefined : safeStringify(err) };
}

function toSimpleString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return safeStringify(value);
}

type LogContext = Record<string, unknown>;

function baseLog(level: LogLevel, subject: unknown, context?: LogContext) {
  if (!shouldLog(level)) return;

  const ts = new Date().toISOString();

  if (subject instanceof Error || subject instanceof AppError) {
    const payload = formatError(subject);
    const meta = context ? { ...context } : undefined;

    const line = {
      level,
      ts,
      msg: payload.message,
      code: payload.code,
      status: payload.status,
      // Only include stack/cause in non-production
      ...(IS_PROD ? {} : { stack: payload.stack, cause: payload.cause, meta }),
    };

    if (level === "error") {
      con.error(line);
    } else if (level === "warn") {
      con.warn(line);
    } else if (level === "info") {
      con.info(line);
    } else {
      con.debug(line);
    }
  } else {
    const line = {
      level,
      ts,
      msg: typeof subject === "string" ? subject : safeStringify(subject),
      ...(context ? { context } : {}),
    };
    if (level === "error") {
      con.error(line);
    } else if (level === "warn") {
      con.warn(line);
    } else if (level === "info") {
      con.info(line);
    } else {
      con.debug(line);
    }
  }
}

export function logDebug(subject: unknown, context?: LogContext) {
  baseLog("debug", subject, context);
}
export function logInfo(subject: unknown, context?: LogContext) {
  baseLog("info", subject, context);
}
export function logWarn(subject: unknown, context?: LogContext) {
  baseLog("warn", subject, context);
}
export function logError(subject: unknown, context?: LogContext) {
  baseLog("error", subject, context);
}

/**
 * Backwards-compatible helper to extract a human-readable error message.
 * Existing code imports this; keep the signature intact.
 */
export function getErrorMessage(err: unknown, fallback: string) {
  return formatError(err, fallback).message;
}
