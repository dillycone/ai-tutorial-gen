"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logWarn } from "@/lib/errors";

export type UseLocalStorageOptions<T> = {
  storage?: Storage | null; // default window.localStorage
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
  validate?: (value: unknown) => value is T;
  sync?: boolean; // listen to "storage" events across tabs (default true)
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function defaultSerialize<T>(value: T): string {
  try {
    // Heuristic: store primitives directly to keep readability
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch {
    try {
      return String(value as unknown as string);
    } catch {
      return "";
    }
  }
}

function defaultDeserialize<T>(raw: string): T {
  // Try JSON parse first, fall back to raw string as unknown
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export function safeGetItem(key: string, storage: Storage | null = isBrowser() ? window.localStorage : null): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch (err) {
    logWarn("localStorage getItem failed", { key, err: String(err) });
    return null;
  }
}

export function safeSetItem(key: string, value: string, storage: Storage | null = isBrowser() ? window.localStorage : null): void {
  try {
    storage?.setItem(key, value);
  } catch (err) {
    logWarn("localStorage setItem failed", { key, err: String(err) });
  }
}

export function safeRemoveItem(key: string, storage: Storage | null = isBrowser() ? window.localStorage : null): void {
  try {
    storage?.removeItem(key);
  } catch (err) {
    logWarn("localStorage removeItem failed", { key, err: String(err) });
  }
}

/**
 * useLocalStorage – SSR-safe localStorage hook with:
 * - JSON-aware serialization by default
 * - Optional custom serialize/deserialize/validate
 * - Key-change awareness (reloads on key change)
 * - Optional cross-tab synchronization (storage events)
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T | (() => T),
  options?: UseLocalStorageOptions<T>,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const storage = options?.storage ?? (isBrowser() ? window.localStorage : null);
  const serialize = options?.serialize ?? defaultSerialize<T>;
  const deserialize = options?.deserialize ?? defaultDeserialize<T>;
  const validate = options?.validate;
  const sync = options?.sync ?? true;

  const initial: T = useMemo(() => {
    try {
      return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    } catch {
      return initialValue as T;
    }
  }, [initialValue]);

  const read = useCallback((): T => {
    const raw = safeGetItem(key, storage);
    if (raw == null) {
      return initial;
    }
    try {
      const parsed = deserialize(raw);
      if (validate) {
        return validate(parsed) ? parsed : initial;
      }
      return parsed;
    } catch {
      return initial;
    }
  }, [deserialize, initial, key, storage, validate]);

  const [value, setValue] = useState<T>(() => (isBrowser() ? read() : initial));

  // Handle key changes by re-reading from storage
  const previousKeyRef = useRef(key);
  useEffect(() => {
    if (previousKeyRef.current !== key) {
      previousKeyRef.current = key;
      if (isBrowser()) {
        setValue(read());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cross-tab sync
  useEffect(() => {
    if (!sync || !isBrowser()) return;
    const handler = (e: StorageEvent) => {
      if (!e.key || e.key !== key) return;
      setValue(read());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, read, sync]);

  const write = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        const raw = serialize(resolved);
        safeSetItem(key, raw, storage);
        return resolved;
      });
    },
    [key, serialize, storage],
  );

  const remove = useCallback(() => {
    safeRemoveItem(key, storage);
    setValue(initial);
  }, [initial, key, storage]);

  return [value, write, remove];
}