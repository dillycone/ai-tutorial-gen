"use client";

import { useEffect } from "react";

export type UseKeyboardShortcutsOptions = {
  enabled?: boolean;
  onCapture?: () => void;
  captureKey?: string | string[]; // default "c" (case-insensitive)
  preventDefault?: boolean; // default true
  avoidWhenTyping?: boolean; // default true
};

function isTypingElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (!tag) return false;
  const t = tag.toUpperCase();
  if (t === "INPUT" || t === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * useKeyboardShortcuts – attaches a keydown handler for common workbench shortcuts.
 * By default, invokes onCapture when user presses "c" outside of input fields.
 */
export function useKeyboardShortcuts({
  enabled = true,
  onCapture,
  captureKey = "c",
  preventDefault = true,
  avoidWhenTyping = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const keys = Array.isArray(captureKey) ? captureKey : [captureKey];
    const normalized = keys.map((k) => String(k).toLowerCase());

    const handler = (event: KeyboardEvent) => {
      if (avoidWhenTyping && isTypingElement(event.target)) {
        return;
      }
      const key = String(event.key || "").toLowerCase();
      if (normalized.includes(key)) {
        if (preventDefault) event.preventDefault();
        onCapture?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [avoidWhenTyping, captureKey, enabled, onCapture, preventDefault]);
}