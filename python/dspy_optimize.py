#!/usr/bin/env python3
"""DSPy GEPA prompt optimizer for Gemini instructions with caching.

This script reads JSON payloads from stdin and returns optimized prompt
components suitable for the Next.js API route. It relies on DSPy 3 + GEPA
and expects the `GEMINI_API_KEY` to be available for the underlying
LiteLLM-backed Gemini models.

Enhancements:
- Weighted feature scoring (schema-specific defaults + overrides).
- JSON bonus weighting configurable from payload.
- File-based optimization result cache (TTL + LRU) to avoid redundant work.
- Progressive validation sets to speed up optimization while maintaining final quality.
- Optional parallel evaluation of prompt fitness across examples using multiprocessing.
"""

from __future__ import annotations

import gc
import json
import os
import random
import re
import sys
import textwrap
import time
from collections import Counter, deque
from dataclasses import dataclass
from math import sqrt, log1p
from typing import Any, Deque, Dict, Iterable, List, Optional, Tuple
import threading
import multiprocessing as mp
from uuid import uuid4
import hashlib
import contextlib  # File locking context manager utilities
try:
    import fcntl  # For file locking on Unix systems
except Exception:
    fcntl = None  # type: ignore

from json_repair import repair_json
from typing import Union
from pydantic import BaseModel, ValidationError, Field

try:
    import dspy
    from dspy.teleprompt import GEPA
except Exception as exc:  # pragma: no cover - import guard
    print(json.dumps({"error": f"DSPy import failed: {exc}"}), file=sys.stderr)
    sys.exit(1)


STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "by",
    "as", "at", "is", "are", "be", "when", "that", "this", "it", "from",
    "should", "must", "may", "can", "will", "if", "then", "into", "over",
    "under", "while", "both", "any", "your", "their", "its", "how"
}

def _normalize_for_match(text: str) -> str:
    """Gentle normalization to help catch paraphrases"""
    t = text.lower()
    t = t.replace("step-by-step", "step by step")
    t = t.replace("-", " ")
    t = re.sub(r"\s+", " ", t)
    return t.strip()

def _tokens(text: str) -> List[str]:
    t = _normalize_for_match(text)
    toks = re.findall(r"[a-z0-9]+", t)
    return [tok for tok in toks if tok not in STOPWORDS and len(tok) > 2]

def _feature_hit(feature_text: str, lowered_content: str, content_tokens_set: set, fuzzy_threshold: float = 0.6) -> bool:
    # Literal phrase hit
    if _normalize_for_match(feature_text) in lowered_content:
        return True
    # Token coverage hit
    ftoks = _tokens(feature_text)
    if not ftoks:
        return False
    overlap = sum(1 for tok in ftoks if tok in content_tokens_set)
    coverage = overlap / max(1, len(ftoks))
    # Relax threshold for very long features
    if len(ftoks) >= 10:
        fuzzy_threshold = max(0.5, fuzzy_threshold - 0.1)
    return coverage >= fuzzy_threshold

def _mp_probe_fn() -> int:
    return 42


def _check_multiprocessing_health() -> bool:
    """Check if multiprocessing is available and working properly."""
    try:
        import multiprocessing as mp  # local import to ensure availability
        # Probe start method if available (may fail in constrained envs)
        try:
            _ = mp.get_start_method()
        except Exception:
            pass

        pool = None
        healthy = False
        try:
            pool = mp.Pool(processes=1)
            # Use a top-level function (picklable) instead of a lambda
            result = pool.apply(_mp_probe_fn)
            healthy = (result == 42)
        finally:
            if pool is not None:
                try:
                    pool.close()
                except Exception:
                    pass
                # terminate is safest in serverless to avoid lingering children
                try:
                    pool.terminate()
                except Exception:
                    pass
                try:
                    pool.join()
                except Exception:
                    pass
        return healthy
    except Exception:
        return False


def _safe_pool_close(pool, force_terminate: bool = False) -> None:
    """Best-effort shutdown of multiprocessing or thread pools.

    If force_terminate is True, attempt terminate() first, then join/close as applicable.
    Otherwise, close() then join(), and finally ensure terminate() is invoked if available.
    """
    if pool is None:
        return
    # Try terminate first when forced
    if force_terminate:
        try:
            if hasattr(pool, "terminate"):
                pool.terminate()
        except Exception:
            pass
    # Try close when not forced
    if not force_terminate:
        try:
            if hasattr(pool, "close"):
                pool.close()
        except Exception:
            pass
    # Join regardless (best-effort)
    try:
        pool.join()
    except Exception:
        pass
    # Final terminate cleanup
    try:
        if hasattr(pool, "terminate"):
            pool.terminate()
    except Exception:
        pass


def _acquire_file_lock(file_handle):
    """Acquire an exclusive lock on a file handle (Unix only)."""
    try:
        if fcntl is None:
            return False
        fcntl.flock(file_handle.fileno(), fcntl.LOCK_EX)
        return True
    except (OSError, AttributeError, NameError):
        # fcntl not available on Windows, or other locking failure
        return False

def _release_file_lock(file_handle):
    """Release a file lock."""
    try:
        if fcntl is None:
            return
        fcntl.flock(file_handle.fileno(), fcntl.LOCK_UN)
    except (OSError, AttributeError, NameError):
        pass  # ignore errors

@contextlib.contextmanager
def _file_lock_context(file_path, mode='r'):
    """Context manager for file locking."""
    lock_acquired = False
    handle = None
    try:
        # Ensure directory exists
        directory = os.path.dirname(file_path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        handle = open(file_path, mode, encoding='utf-8')
        lock_acquired = _acquire_file_lock(handle)
        yield handle, lock_acquired
    finally:
        if handle:
            if lock_acquired:
                _release_file_lock(handle)
            try:
                handle.close()
            except Exception:
                pass


DEFAULT_INSTRUCTIONS = textwrap.dedent(
    """
    The assistant optimizes Gemini system prompts by blending a `base_prompt`
    with directives from an `optimization_brief` and context inside a
    `context_summary`.

    **Input fields:**
      1. `context_summary` – background, schema toggles, screenshot ids/timecodes.
      2. `base_prompt` – original persona, requirements, and fallback output.
      3. `optimization_brief` – bullet list of refinements that must be reflected.

    **Output:** Return STRICT JSON with:
      * `persona` (string) – refined expert role.
      * `requirements` (array of strings) – each entry is a standalone directive.
      * `fallbackOutput` (string or JSON object) – mirrors the structure the
        assistant should fall back to when schema enforcement is off.
      * `styleGuide` (string, optional).

    **Core rules:**
      * Integrate every item from the optimization brief.
      * Always include a grounding requirement tying outputs to observable
        timeline actions and provided screenshots.
      * Cite screenshot IDs exactly as given (`s1`, `s2`…), including timecodes
        when they appear in the context. Never invent new IDs.
      * Schema handling:
          - If the context or brief demands strict JSON right now, add a
            requirement: "Return the complete output as a STRICT JSON object,
            adhering to the structure described in the fallbackOutput field." and
            express other format guidance in terms of that schema.
          - Otherwise add a conditional requirement describing how to behave when
            a JSON schema is supplied, and preserve the Markdown fallback.
      * Keep the language clear, professional, and non-redundant.
      * Do not fabricate data or screenshots beyond what is provided.
    """
).strip()

# ---- Minimal prompt generator module for GEPA ----
class _PromptSignature(dspy.Signature):
    """The model must return STRICT JSON with:
    persona (string),
    requirements (array of strings),
    fallbackOutput (string or JSON object),
    styleGuide (string, optional).
    The JSON should reflect refinements implied by the optimization_brief.
    """
    context_summary = dspy.InputField(desc="Summary of context")
    base_prompt = dspy.InputField(desc="Base prompt to optimize")
    optimization_brief = dspy.InputField(desc="Brief for optimization")
    optimized_prompt = dspy.OutputField(desc="Optimized prompt result")

class PromptOptimizer(dspy.Module):
    def __init__(self, instructions: str):
        super().__init__()
        # Use the signature directly - DSPy will use the docstring from _PromptSignature
        # Store instructions separately if needed for custom behavior
        self.instructions = instructions
        self.generate = dspy.Predict(_PromptSignature)

    def forward(self, context_summary: str, base_prompt: str, optimization_brief: str):
        return self.generate(
            context_summary=context_summary,
            base_prompt=base_prompt,
            optimization_brief=optimization_brief,
        )

@dataclass
class PromptConfig:
    persona: str
    requirements: str
    fallback_output: str
    style_guide: Optional[str] = None
    requirements_list: Optional[List[str]] = None
    fallback_output_json: Optional[Any] = None


class PromptConfigSchema(BaseModel):
    """Pydantic model for validating parsed prompt JSON structure."""
    persona: str = Field(min_length=1, description="Expert role description")
    requirements: Union[List[str], str] = Field(description="Requirements as list or string")
    fallbackOutput: Optional[Union[str, Dict[str, Any], List[Any]]] = Field(default="", description="Fallback output structure")
    styleGuide: Optional[str] = Field(default=None, description="Optional style guidance")

    class Config:
        extra = "ignore"  # Allow extra fields but ignore them
        str_strip_whitespace = True  # Auto-strip strings


def _strip_code_fence(text: str) -> str:
    trimmed = text.strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```[a-zA-Z]*", "", trimmed)
        if "```" in trimmed:
            trimmed = trimmed.rsplit("```", 1)[0]
    return trimmed.strip()


def _compose_prompt_text(config: Dict[str, Any]) -> str:
    persona = config.get("persona", "").strip()
    requirements = config.get("requirements", "").strip()
    fallback = config.get("fallbackOutput", "").strip()
    style = config.get("styleGuide", "").strip()
    parts = [
        "Persona:\n" + persona if persona else "",
        "Requirements:\n" + requirements if requirements else "",
        "Fallback Output:\n" + fallback if fallback else "",
    ]
    if style:
        parts.append("Style Guide:\n" + style)
    return "\n\n".join(part for part in parts if part)


def _compose_prompt_text_from_fields(
    persona: str,
    requirements: str,
    fallback: str,
    style: Optional[str],
) -> str:
    data = {
        "persona": persona,
        "requirements": requirements,
        "fallbackOutput": fallback,
    }
    if style:
        data["styleGuide"] = style
    return _compose_prompt_text(data)


class RateLimiter:
    def __init__(self, rpm_limit: int):
        self._rpm_limit = max(1, rpm_limit)
        self._calls: Deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            while True:
                now = time.time()
                while self._calls and now - self._calls[0] >= 60:
                    self._calls.popleft()
                if len(self._calls) < self._rpm_limit:
                    self._calls.append(now)
                    return
                wait_time = max(0.0, 60 - (now - self._calls[0]) + 0.05)
                time.sleep(wait_time)


class ThrottledLM(dspy.LM):
    def __init__(self, *args: Any, rate_limiter: RateLimiter, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._rate_limiter = rate_limiter

    def __call__(self, *args: Any, **kwargs: Any):  # type: ignore[override]
        self._rate_limiter.acquire()
        return super().__call__(*args, **kwargs)

    @staticmethod
    def _analyze_with_base(combined_lower: str, features: List[str], weights_map: Dict[str, float], bonus: float) -> Dict[str, Any]:
        return _analyze_with_base(combined_lower, features, weights_map, bonus)


# ---------- Experience bank helpers ----------

def _exp_pack(entry: Dict[str, Any]) -> str:
    return json.dumps(entry, ensure_ascii=False)


def _exp_iter(path: str) -> Iterable[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
          line = line.strip()
          if not line:
              continue
          try:
              yield json.loads(line)
          except Exception:
              continue


def _write_experiences(path: str, items: List[Dict[str, Any]]) -> None:
    if not path:
        return
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    # Use atomic write with a process-specific temp file and locking
    tmp = path + f".tmp.{os.getpid()}.{time.time()}"
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            lock_acquired = _acquire_file_lock(handle)
            try:
                for item in items:
                    try:
                        handle.write(_exp_pack(item) + "\n")
                    except Exception:
                        continue
            finally:
                if lock_acquired:
                    _release_file_lock(handle)

        os.replace(tmp, path)
    except Exception:
        # Fallback with locking directly on target file
        try:
            with _file_lock_context(path, 'w') as (handle, locked):
                for item in items:
                    try:
                        handle.write(_exp_pack(item) + "\n")
                    except Exception:
                        continue
        except Exception:
            pass
        finally:
            # Cleanup temp file if it wasn't replaced
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except Exception:
                pass


def _generate_id() -> str:
    return str(uuid4())


def _text2bow(text: str) -> Counter:
    tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
    return Counter(token for token in tokens if len(token) > 2)


def _cosine(a: Counter, b: Counter) -> float:
    common = set(a) & set(b)
    numerator = sum(a[token] * b[token] for token in common)
    denominator = sqrt(sum(val * val for val in a.values())) * sqrt(sum(val * val for val in b.values()))
    return (numerator / denominator) if denominator else 0.0


def _retrieve_experiences(
    path: str,
    schema_type: str,
    query_text: str,
    top_k: int,
    min_score: float,
) -> List[Dict[str, Any]]:
    """Retrieve top-k experiences prioritizing similarity, score, and recency."""
    if not path or not os.path.exists(path) or top_k <= 0:
        return []
    candidates: List[Tuple[float, Dict[str, Any]]] = []
    now = time.time()
    query_bow = _text2bow(query_text)
    for item in _exp_iter(path):
        if item.get("schemaType") != schema_type:
            continue
        item_score = float(item.get("score", 0.0) or 0.0)
        if not item.get("parsed") or item_score < float(min_score):
            continue
        combined = f"{item.get('context_summary', '')}\n{item.get('optimization_brief', '')}"
        similarity = _cosine(query_bow, _text2bow(combined))
        age_seconds = max(1.0, now - float(item.get("ts", now)))
        recency_bonus = 1.0 / max(1.0, age_seconds / 86400.0)  # ~1 for last 24h, decays with age (days)
        usage = max(0, int(item.get("usageCount", 0)))
        usage_bonus = min(0.1, 0.03 * log1p(usage))  # small boost for frequently used
        weight = (0.7 * similarity) + (0.2 * item_score) + (0.1 * recency_bonus) + usage_bonus
        candidates.append((weight, item))
    candidates.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in candidates[:top_k]]


def _append_experience(path: str, record: Dict[str, Any]) -> None:
    if not path:
        return
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    # Ensure stable id and default usageCount
    if not record.get("id"):
        record["id"] = _generate_id()
    if "usageCount" not in record:
        record["usageCount"] = 0
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(_exp_pack(record) + "\n")


def _bump_usage_counts(path: str, ids: List[str]) -> None:
    if not path or not os.path.exists(path) or not ids:
        return
    idset = set(i for i in ids if i)
    if not idset:
        return
    items: List[Dict[str, Any]] = []
    changed = False
    for item in _exp_iter(path):
        if item.get("id") in idset:
            item["usageCount"] = max(0, int(item.get("usageCount", 0))) + 1
            changed = True
        items.append(item)
    if changed:
        _write_experiences(path, items)


def _prune_experiences(path: str, prune_threshold: float = 0.5, max_age_days: int = 30) -> Dict[str, int]:
    """Prune experiences with low score or too old."""
    if not path or not os.path.exists(path):
        return {"before": 0, "after": 0, "removed": 0}
    now = time.time()
    max_age_seconds = max(0, int(max_age_days)) * 86400
    keep: List[Dict[str, Any]] = []
    before = 0
    for item in _exp_iter(path):
        before += 1
        score = float(item.get("score", 0.0) or 0.0)
        ts = float(item.get("ts", now))
        too_old = max_age_seconds > 0 and (now - ts) > max_age_seconds
        if score < float(prune_threshold) or too_old:
            continue
        keep.append(item)
    _write_experiences(path, keep)
    return {"before": before, "after": len(keep), "removed": before - len(keep)}


def _build_experience_example(item: Dict[str, Any]) -> dspy.Example:
    improved_text = _compose_prompt_text_from_fields(
        item.get("persona") or "",
        item.get("requirements") or "",
        item.get("fallbackOutput") or "",
        item.get("styleGuide") or None,
    )
    return dspy.Example(
        context_summary=item.get("context_summary", ""),
        base_prompt=improved_text or item.get("base_prompt", ""),
        optimization_brief=item.get("optimization_brief", ""),
        expected_keywords=item.get("expected_keywords", []),
    ).with_inputs("context_summary", "base_prompt", "optimization_brief")


def _parse_prompt_json(raw_text: str) -> Tuple[Optional[PromptConfig], bool, Optional[str]]:
    cleaned = _strip_code_fence(raw_text)
    if not cleaned:
        return None, False, "Empty response"

    parse_error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    # Step 1: Parse JSON (with repair if needed)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        try:
            repaired = repair_json(cleaned)
            data = json.loads(repaired)
        except Exception as err:  # pragma: no cover - fallback path
            parse_error = str(err)
            data = None

    if not isinstance(data, dict):
        return None, False, parse_error or "Response is not a JSON object"

    # Step 2: Validate against pydantic schema
    schema_valid = False
    try:
        _ = PromptConfigSchema(**data)
        schema_valid = True
    except ValidationError as ve:
        parse_error = f"Schema validation failed: {ve}"
        schema_valid = False
    except Exception as e:
        parse_error = f"Validation error: {e}"
        schema_valid = False

    # Step 3: Extract and normalize fields (whether schema-valid or not)
    persona = str(data.get("persona", "")).strip()

    raw_requirements = data.get("requirements", "")
    normalized_requirements: List[str] = []
    if isinstance(raw_requirements, list):
        for item in raw_requirements:
            text_item = str(item).strip()
            if text_item:
                normalized_requirements.append(text_item)
    else:
        text_block = str(raw_requirements or "").strip()
        if text_block:
            for line in re.split(r"\n+", text_block):
                cleaned_line = re.sub(r"^[\-\*•]\s*", "", line).strip()
                if cleaned_line:
                    normalized_requirements.append(cleaned_line)

    requirements_text = "\n".join(f"- {item}" for item in normalized_requirements)

    raw_fallback = data.get("fallbackOutput", data.get("fallback", ""))
    fallback_json: Optional[Any] = None
    if isinstance(raw_fallback, (dict, list)):
        fallback_json = raw_fallback
        fallback_output = json.dumps(raw_fallback, ensure_ascii=False, indent=2)
    elif raw_fallback is None:
        fallback_output = ""
    else:
        fallback_output = str(raw_fallback).strip()

    style = data.get("styleGuide")
    if isinstance(style, list):
        style = "\n".join(str(item).strip() for item in style if str(item).strip())
    style_text = str(style).strip() if style else None

    # Step 4: Determine if parsing was fully successful
    # Only consider it "parsed" if schema validation passed AND required fields are present
    fully_parsed = schema_valid and bool(persona) and bool(normalized_requirements)

    return (
        PromptConfig(
            persona=persona,
            requirements=requirements_text,
            fallback_output=fallback_output,
            style_guide=style_text,
            requirements_list=normalized_requirements or None,
            fallback_output_json=fallback_json,
        ),
        fully_parsed,
        parse_error,
    )


def _default_category_weights(schema_type: str) -> Dict[str, float]:
    """Default feature category weights by schema type."""
    if schema_type == "meetingSummary":
        return {
            "schemaFocus": 2.0,
            "grounding": 2.0,
            "screenshotCitation": 0.5,
            "timecodeOrdering": 0.5,
            "titleHint": 0.5,
            "formatWhenEnforced": 1.0,
            "formatWhenNotEnforced": 1.0,
            "noScreenshotsBehavior": 0.5,
        }
    # tutorial defaults aligned with UI (lib/featureImportance.ts)
    return {
        "schemaFocus": 2.0,
        "grounding": 2.0,
        "screenshotCitation": 1.0,
        "timecodeOrdering": 2.0,
        "titleHint": 0.5,
        "formatWhenEnforced": 1.0,
        "formatWhenNotEnforced": 0.5,
        "noScreenshotsBehavior": 0.5,
    }


def _build_features(payload: Dict[str, Any]) -> Tuple[List[str], Dict[str, float]]:
    """Build features plus a per-feature weight map derived from schema/category settings."""
    schema_type = payload.get("schemaType", "tutorial")
    enforce_schema = bool(payload.get("enforceSchema", False))
    title_hint = payload.get("titleHint", "").strip()
    shots: List[Dict[str, Any]] = payload.get("shots", []) or []
    overrides: Dict[str, Any] = payload.get("featureWeights", {}) or {}

    schema_focus = {
        "tutorial": "Deliver a step-by-step tutorial grounded in the recording",
        "meetingSummary": "Produce an executive-ready meeting summary with clear sections",
    }.get(schema_type, "Deliver the requested output with clear structure")

    # Build (text, category) tuples
    entries: List[Tuple[str, str]] = [(schema_focus, "schemaFocus")]

    if shots:
        ids = ", ".join(str(shot.get("id")) for shot in shots if shot.get("id"))
        entries.append((f"Explicitly reference screenshot IDs exactly as provided ({ids}) when relevant", "screenshotCitation"))
        entries.append(("Use screenshot timecodes to reinforce chronological ordering", "timecodeOrdering"))
    else:
        entries.append(("Clarify that screenshots may be absent and the video timeline should drive structure", "noScreenshotsBehavior"))

    if title_hint:
        entries.append((f"Respect the optional title hint \"{title_hint}\" without copying verbatim", "titleHint"))

    if enforce_schema:
        entries.append(("Remind Gemini to return STRICT JSON that matches the schema and repair minor formatting issues", "formatWhenEnforced"))
    else:
        entries.append(("Allow richly formatted Markdown when JSON enforcement is off, but keep sections explicit", "formatWhenNotEnforced"))

    entries.append(("Emphasize grounding in both the video actions and any captured screenshots", "grounding"))

    # Build default category weights and apply overrides
    category_weights: Dict[str, float] = _default_category_weights(schema_type)
    # Overrides can reference category keys or exact feature strings
    exact_text_overrides: Dict[str, float] = {}
    try:
        if isinstance(overrides, dict):
            for k, v in overrides.items():
                try:
                    w = float(v)
                except Exception:
                    continue
                k_norm = str(k or "").strip()
                if not k_norm:
                    continue
                if k_norm in category_weights:
                    category_weights[k_norm] = max(0.0, w)
                else:
                    exact_text_overrides[k_norm.lower()] = max(0.0, w)
    except Exception:
        pass

    # Map per-feature text weights
    weights_by_text: Dict[str, float] = {}
    for text, cat in entries:
        w = float(category_weights.get(cat, 1.0))
        weights_by_text[text] = w

    # Apply exact-text overrides (if provided)
    if exact_text_overrides:
        for text in list(weights_by_text.keys()):
            norm = text.lower()
            if norm in exact_text_overrides:
                weights_by_text[text] = exact_text_overrides[norm]

    features = [text for text, _ in entries]
    return features, weights_by_text


def _summarize_shots(shots: Iterable[Dict[str, Any]]) -> str:
    entries: List[str] = []
    for shot in shots:
        identifier = str(shot.get("id", ""))
        timecode = shot.get("timecode") or "?"
        label = shot.get("label") or ""
        note = shot.get("note") or ""
        summary_parts = [identifier]
        if timecode:
            summary_parts.append(f"@{timecode}")
        if label:
            summary_parts.append(f"label: {label}")
        if note:
            summary_parts.append(f"note: {note}")
        entries.append(" ".join(summary_parts))
    return "; ".join(entries) if entries else "(no screenshots captured)"


def _build_weights_map(feature_weights: Optional[Dict[str, float]]) -> Dict[str, float]:
    """Normalize feature weight overrides to a case-insensitive lookup."""
    weights_map: Dict[str, float] = {}
    if isinstance(feature_weights, dict):
        for key, value in feature_weights.items():
            try:
                w = max(0.0, float(value))
            except Exception:
                continue
            norm_key = str(key).strip().lower()
            if norm_key:
                weights_map[norm_key] = w
    return weights_map


def _analyze_with_base(
    combined_lower: str,
    features: List[str],
    weights_map: Dict[str, float],
    json_bonus_if_parsed: float,
) -> Dict[str, Any]:
    """Fast path analysis using precomputed combined text + json bonus (when parsed ok)."""
    hits: List[str] = []
    missing: List[str] = []

    total_weight = 0.0
    hit_weight = 0.0

    content_tokens_set = set(_tokens(combined_lower))

    for feature in features or []:
        normalized = str(feature or "").strip()
        if not normalized:
            continue
        weight = float(weights_map.get(normalized.lower(), 1.0))
        total_weight += weight
        if _feature_hit(normalized, combined_lower, content_tokens_set):
            hits.append(feature)
            hit_weight += weight
        else:
            missing.append(feature)

    coverage = (hit_weight / total_weight) if total_weight > 1e-9 else 1.0
    score = min(1.0, coverage + json_bonus_if_parsed)

    return {
        "score": round(score, 4),
        "coverage": round(coverage, 4),
        "satisfied": hits,
        "missing": missing,
        "satisfiedCount": len(hits),
    }


def _parallel_worker(args: Tuple[str, List[str], Dict[str, float], float]) -> Dict[str, Any]:
    combined_lower, features, weights_map, bonus = args
    try:
        return ThrottledLM._analyze_with_base(combined_lower, features, weights_map, bonus)
    except Exception:
        # fallback per-item error resilience
        return {"score": 0.0, "coverage": 0.0, "satisfied": [], "missing": features or [], "satisfiedCount": 0}


def _precompute_prompt_base(raw_text: str, json_bonus: float) -> Tuple[str, float]:
    """Parse the prompt JSON once to derive combined text and assign bonus if parsed."""
    parsed, parsed_ok, _ = _parse_prompt_json(raw_text)
    if parsed and parsed_ok:
        combined_text = " \n".join(
            part
            for part in [
                parsed.persona,
                parsed.requirements,
                parsed.fallback_output,
                parsed.style_guide or "",
            ]
            if part
        )
        return combined_text.lower(), max(0.0, float(json_bonus))
    # Parsing failed; no bonus and compare against raw text
    return str(raw_text or "").lower(), 0.0


def _parallel_evaluate_prompt(
    raw_text: str,
    feature_sets: List[List[str]],
    json_bonus: float,
    feature_weights: Optional[Dict[str, float]],
    workers: int,
    batch_size: int,
    timeout_s: float,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Evaluate prompt fitness against many feature sets in parallel."""
    if not feature_sets:
        return [], {"evaluated": 0, "workers": 0, "batch": batch_size}

    combined_lower, bonus = _precompute_prompt_base(raw_text, json_bonus)
    weights_map = _build_weights_map(feature_weights)

    args_iter = [(combined_lower, fs or [], weights_map, bonus) for fs in feature_sets]

    results: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {"evaluated": len(feature_sets), "workers": max(1, workers), "batch": max(1, batch_size)}

    # Respect environment override for threads
    parallel_mode = (os.environ.get("DSPY_PARALLEL") or "").strip().lower()
    force_threads = parallel_mode in ("threads", "thread")

    # Helper to run sequential
    def _run_sequential() -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        seq_results = [_parallel_worker(arg) for arg in args_iter]
        meta_seq = {**meta, "workers": 1, "fallback": "sequential"}
        return seq_results, meta_seq

    # Try thread pool if explicitly requested
    if force_threads:
        try:
            import multiprocessing.dummy as mp_dummy  # threads-based Pool
            pool = None
            try:
                pool = mp_dummy.Pool(processes=max(1, int(workers)))
                job = pool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
                try:
                    results = job.get(timeout=max(1.0, float(timeout_s)))
                    meta["mode"] = "threads"
                    return results, meta
                except mp.TimeoutError as exc:
                    _safe_pool_close(pool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread pool timeout ({exc})"
                    return seq_results, seq_meta
                except Exception as exc:
                    _safe_pool_close(pool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread pool failed ({exc})"
                    return seq_results, seq_meta
            finally:
                _safe_pool_close(pool)
        except Exception:
            # Fall back to sequential if threads fail to initialize
            seq_results, seq_meta = _run_sequential()
            seq_meta["fallback"] = "sequential - thread pool init failed"
            return seq_results, seq_meta

    # If multiprocessing is unhealthy, prefer thread pool, else sequential
    if not _check_multiprocessing_health():
        try:
            import multiprocessing.dummy as mp_dummy
            pool = None
            try:
                pool = mp_dummy.Pool(processes=max(1, int(workers)))
                job = pool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
                try:
                    results = job.get(timeout=max(1.0, float(timeout_s)))
                    meta["mode"] = "threads"
                    meta["fallback"] = "threads - multiprocessing unavailable"
                    return results, meta
                except mp.TimeoutError as exc:
                    _safe_pool_close(pool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread pool timeout ({exc}); multiprocessing unavailable"
                    return seq_results, seq_meta
                except Exception as exc:
                    _safe_pool_close(pool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread pool failed ({exc}); multiprocessing unavailable"
                    return seq_results, seq_meta
            finally:
                _safe_pool_close(pool)
        except Exception:
            seq_results, seq_meta = _run_sequential()
            seq_meta["fallback"] = "sequential - multiprocessing unavailable"
            return seq_results, seq_meta

    # Try process pool; on failure or timeout, fall back to threads, then sequential
    try:
        pool = None
        try:
            pool = mp.Pool(processes=max(1, int(workers)))
            job = pool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
            try:
                results = job.get(timeout=max(1.0, float(timeout_s)))
                meta["mode"] = "processes"
                return results, meta
            except mp.TimeoutError as exc:
                _safe_pool_close(pool, force_terminate=True)
                # Fallback: threads
                try:
                    import multiprocessing.dummy as mp_dummy
                    tpool = None
                    try:
                        tpool = mp_dummy.Pool(processes=max(1, int(workers)))
                        tjob = tpool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
                        try:
                            results = tjob.get(timeout=max(1.0, float(timeout_s)))
                            meta["mode"] = "threads"
                            meta["fallback"] = f"threads - process pool timeout ({exc})"
                            return results, meta
                        except mp.TimeoutError as exc2:
                            _safe_pool_close(tpool, force_terminate=True)
                            seq_results, seq_meta = _run_sequential()
                            seq_meta["fallback"] = f"sequential - both pools timeout (proc: {exc}, thread: {exc2})"
                            return seq_results, seq_meta
                        except Exception as exc2:
                            _safe_pool_close(tpool, force_terminate=True)
                            seq_results, seq_meta = _run_sequential()
                            seq_meta["fallback"] = f"sequential - process timeout; thread failed ({exc2})"
                            return seq_results, seq_meta
                    finally:
                        _safe_pool_close(tpool)
                except Exception:
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = "sequential - process timeout; thread init failed"
                    return seq_results, seq_meta
            except Exception as exc:
                _safe_pool_close(pool, force_terminate=True)
                # Fallback: threads
                try:
                    import multiprocessing.dummy as mp_dummy
                    tpool = None
                    try:
                        tpool = mp_dummy.Pool(processes=max(1, int(workers)))
                        tjob = tpool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
                        try:
                            results = tjob.get(timeout=max(1.0, float(timeout_s)))
                            meta["mode"] = "threads"
                            meta["fallback"] = f"threads - process pool failed ({exc})"
                            return results, meta
                        except mp.TimeoutError as exc2:
                            _safe_pool_close(tpool, force_terminate=True)
                            seq_results, seq_meta = _run_sequential()
                            seq_meta["fallback"] = f"sequential - thread timeout after process failure ({exc2})"
                            return seq_results, seq_meta
                        except Exception as exc2:
                            _safe_pool_close(tpool, force_terminate=True)
                            seq_results, seq_meta = _run_sequential()
                            seq_meta["fallback"] = f"sequential - thread failed after process failure ({exc2})"
                            return seq_results, seq_meta
                    finally:
                        _safe_pool_close(tpool)
                except Exception:
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = "sequential - process failed; thread init failed"
                    return seq_results, seq_meta
        finally:
            _safe_pool_close(pool)
    except Exception:
        # Fallback: threads
        try:
            import multiprocessing.dummy as mp_dummy
            tpool = None
            try:
                tpool = mp_dummy.Pool(processes=max(1, int(workers)))
                tjob = tpool.map_async(_parallel_worker, args_iter, chunksize=max(1, int(batch_size)))
                try:
                    results = tjob.get(timeout=max(1.0, float(timeout_s)))
                    meta["mode"] = "threads"
                    meta["fallback"] = "threads - process pool init failed"
                    return results, meta
                except mp.TimeoutError as exc2:
                    _safe_pool_close(tpool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread timeout after process init failure ({exc2})"
                    return seq_results, seq_meta
                except Exception as exc2:
                    _safe_pool_close(tpool, force_terminate=True)
                    seq_results, seq_meta = _run_sequential()
                    seq_meta["fallback"] = f"sequential - thread failed after process init failure ({exc2})"
                    return seq_results, seq_meta
            finally:
                _safe_pool_close(tpool)
        except Exception:
            seq_results, seq_meta = _run_sequential()
            seq_meta["fallback"] = "sequential - both pools failed"
            return seq_results, seq_meta

    return results, meta


def _analyze_output(
    raw_text: str,
    features: List[str],
    json_bonus: float = 0.0,
    feature_weights: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    parsed, parsed_ok, parse_error = _parse_prompt_json(raw_text)

    if parsed and parsed_ok:
        combined_text = " \n".join(
            part
            for part in [
                parsed.persona,
                parsed.requirements,
                parsed.fallback_output,
                parsed.style_guide or "",
            ]
            if part
        )
        bonus = max(0.0, float(json_bonus))
    else:
        combined_text = raw_text
        bonus = 0.0

    # Prepare weights map (case-insensitive). Default weight is 1.0 when not specified.
    weights_map: Dict[str, float] = _build_weights_map(feature_weights)

    hits: List[str] = []
    missing: List[str] = []

    lowered = _normalize_for_match(combined_text)
    content_tokens_set = set(_tokens(lowered))

    total_weight = 0.0
    hit_weight = 0.0

    for feature in features:
        f = str(feature or "").strip()
        if not f:
            continue
        weight = float(weights_map.get(f.lower(), 1.0))
        total_weight += weight
        if _feature_hit(f, lowered, content_tokens_set):
            hits.append(f)
            hit_weight += weight
        else:
            missing.append(f)

    coverage = (hit_weight / total_weight) if total_weight > 1e-9 else 1.0
    score = min(1.0, coverage + bonus)

    feedback_parts: List[str] = []
    if missing:
        feedback_parts.append("Add guidance about: " + "; ".join(missing[:3]))
        if len(missing) > 3:
            feedback_parts.append(f"(+{len(missing) - 3} more coverage goals)")
    if parse_error:
        feedback_parts.append(f"Fix JSON formatting issues ({parse_error})")

    feedback = " ".join(feedback_parts) if feedback_parts else "Prompt satisfies the optimization brief."

    return {
        "parsed": bool(parsed and parsed_ok),
        "parseError": parse_error,
        "score": round(score, 4),
        "coverage": round(coverage, 4),
        "satisfied": hits,
        "missing": missing,
        "feedback": feedback,
        "persona": parsed.persona if parsed else None,
        "requirements": parsed.requirements if parsed else None,
        "fallbackOutput": parsed.fallback_output if parsed else None,
        "styleGuide": parsed.style_guide if parsed else None,
        "requirementsList": parsed.requirements_list if parsed else None,
        "fallbackOutputJson": parsed.fallback_output_json if parsed else None,
    }


def _foundation_examples_for_schema(schema_key: str) -> List[dspy.Example]:
    """Build diverse foundation examples for a schema across screenshot scenarios."""
    friendly = "step-by-step tutorial" if schema_key == "tutorial" else "executive-ready meeting summary"
    base_context_prefix = (
        f"We are optimizing prompts for {friendly} outputs generated from product recordings."
    )
    examples: List[dspy.Example] = []

    scenarios = [
        {
            "label": "no screenshots",
            "shot_desc": "Screenshots are absent; rely on the video timeline only.",
            "features": [
                f"Keep the persona oriented around an {friendly}",
                "Clarify that screenshots may be absent and the video timeline should drive structure",
                "Mention grounding in both timeline and screenshots (when available)",
                "Clarify how to behave when JSON schema enforcement is toggled",
            ],
        },
        {
            "label": "few screenshots",
            "shot_desc": "Screenshots captured: s1 @00:30, s2 @01:05",
            "features": [
                f"Keep the persona oriented around an {friendly}",
                "Spell out how to cite screenshot IDs exactly as provided (s1, s2) including timecodes",
                "Mention grounding in both the timeline and screenshots",
                "Clarify how to behave when JSON schema enforcement is toggled",
            ],
        },
        {
            "label": "many screenshots",
            "shot_desc": "Screenshots captured: s1 @00:12, s2 @00:48, s3 @01:05, s4 @02:10, s5 @03:00",
            "features": [
                f"Keep the persona oriented around an {friendly}",
                "Encourage grouping steps by timeline segments and cite screenshot IDs exactly as provided",
                "Ensure chronological ordering with timecodes",
                "Clarify how to behave when JSON schema enforcement is toggled",
            ],
        },
    ]

    for scenario in scenarios:
        context_summary = (
            f"{base_context_prefix} {scenario['shot_desc']}"
        )
        base_prompt_text = "Persona:\n\nRequirements:\n\nFallback Output:\n"
        optimization_brief = "\n".join(f"- {item}" for item in scenario["features"])
        examples.append(
            dspy.Example(
                context_summary=context_summary,
                base_prompt=base_prompt_text,
                optimization_brief=optimization_brief,
                expected_keywords=scenario["features"],
            ).with_inputs("context_summary", "base_prompt", "optimization_brief")
        )

    return examples


def _build_trainset(
    payload: Dict[str, Any]
) -> Tuple[List[dspy.Example], str, str, List[str], Dict[str, Any]]:
    reference_prompts: Dict[str, Any] = payload.get("referencePrompts", {}) or {}
    shots = payload.get("shots", []) or []
    schema_type = payload.get("schemaType", "tutorial")
    experience_path = payload.get("experiencePath") or os.environ.get("DSPY_EXPERIENCE_PATH") or ""
    top_k = int(payload.get("experienceTopK", 8) or 0)
    # Default retrieval threshold lowered to 0.5; allow env override DSPY_EXPERIENCE_MIN_SCORE
    try:
        min_score = float(payload.get("experienceMinScore", os.environ.get("DSPY_EXPERIENCE_MIN_SCORE", 0.5)))
    except Exception:
        min_score = 0.5

    # Diverse foundation examples for both schemas
    foundation_examples: List[dspy.Example] = []
    for schema_key, config in reference_prompts.items():
        base_prompt_text = _compose_prompt_text(config)
        diverse_examples = _foundation_examples_for_schema(schema_key)
        for ex in diverse_examples:
            ex.base_prompt = base_prompt_text  # type: ignore[attr-defined]
        foundation_examples.extend(diverse_examples)

    base_prompt = payload.get("basePrompt") or reference_prompts.get(schema_type) or {}
    base_prompt_text = _compose_prompt_text(base_prompt)
    features, feature_weights_by_text = _build_features(payload)
    shots_summary = _summarize_shots(shots)

    enforce_schema = bool(payload.get("enforceSchema", False))
    title_hint = payload.get("titleHint", "").strip()
    schema_label = "tutorial" if schema_type == "tutorial" else "meeting summary"

    request_context_summary = textwrap.dedent(
        f"""
        Optimize the Gemini prompt for a {schema_label}. The video has {len(shots)} captured screenshots: {shots_summary}.
        Schema enforcement is {'enabled' if enforce_schema else 'disabled'}.
        Title hint provided: {title_hint or '(none)'}.
        """
    ).strip()

    request_example = dspy.Example(
        context_summary=request_context_summary,
        base_prompt=base_prompt_text,
        optimization_brief="\n".join(f"- {item}" for item in features),
        expected_keywords=features,
    ).with_inputs("context_summary", "base_prompt", "optimization_brief")

    retrieved_examples: List[dspy.Example] = []
    retrieved_records: List[Dict[str, Any]] = []
    if experience_path and top_k > 0:
        query_text = request_context_summary + "\n" + "\n".join(features)
        retrieved_records = _retrieve_experiences(experience_path, schema_type, query_text, top_k, min_score)
        retrieved_examples = [_build_experience_example(item) for item in retrieved_records]

    trainset = foundation_examples + retrieved_examples + [request_example]
    extras = {
        "retrieved": retrieved_records,
        "retrievedCount": len(retrieved_examples),
        "experiencePath": experience_path,
        "schemaType": schema_type,
        "featureWeightsByText": feature_weights_by_text,
        "foundationCount": len(foundation_examples),
    }
    return trainset, request_context_summary, base_prompt_text, features, extras


def _prepare_metric(
    json_bonus: float,
    feature_weights: Optional[Dict[str, float]],
    validation_size: int,
    validation_total: int,
    stage: int,
    stages: int,
    best_tracker: Optional[Dict[str, Any]] = None,
    flags: Optional[Dict[str, Any]] = None,
    best_prompts_path: Optional[str] = None,
    request_context_summary: Optional[str] = None,
    base_prompt_text: Optional[str] = None,
) -> Any:
    state = {"i": 0, "best": 0.0, "bestCoverage": 0.0}
    confidence = max(0.0, min(1.0, (validation_size / max(1, validation_total))))
    # Initialize trackers/flags (shared across stages)
    if best_tracker is None:
        best_tracker = {"iteration": 0, "raw": 0.0, "adj": 0.0, "coverage": 0.0, "stage": 0}
    if flags is None:
        flags = {"globalIteration": 0, "perfectStreak": 0, "earlyStop": False, "earlyStopThreshold": 10}
    # Defaults for enhanced behavior
    if "autosaveInterval" not in flags:
        flags["autosaveInterval"] = 5  # periodic autosave every N global iterations
    if "lastAutosaveIter" not in flags:
        flags["lastAutosaveIter"] = 0
    if "emergencyState" not in flags or not isinstance(flags.get("emergencyState"), dict):
        flags["emergencyState"] = {}
    # Mark optimizing as true within metric calls
    flags["optimizing"] = True

    def metric(gold: dspy.Example, pred: dspy.Prediction, *_: Any, **__: Any) -> float:
        raw = getattr(pred, "optimized_prompt", "")
        features = getattr(gold, "expected_keywords", []) or []
        analysis = _analyze_output(
            raw,
            features,
            json_bonus=json_bonus,
            feature_weights=feature_weights,
        )
        raw_score = float(analysis.get("score") or 0.0)
        coverage = float(analysis.get("coverage") or 0.0)

        # Confidence-adjusted score for progress (display only)
        conf_factor = 0.5 + 0.5 * confidence
        adj_score = raw_score * conf_factor

        state["i"] += 1
        flags["globalIteration"] = int(flags.get("globalIteration", 0)) + 1

        improved = adj_score > state["best"]
        if improved:
            state["best"] = adj_score
            state["bestCoverage"] = max(state["bestCoverage"], coverage)

        # Emergency/save paths provided via flags
        emergency_state = flags.get("emergencyState") or {}
        debug_log_path = str(flags.get("debugLogPath") or "")
        emergency_best_path = str(flags.get("emergencyBestPath") or "")

        # Global best tracking (across stages)
        prev_raw_best = float(best_tracker.get("raw", 0.0))
        raw_improved = raw_score > prev_raw_best
        if raw_improved:
            best_tracker["raw"] = raw_score
            best_tracker["adj"] = adj_score
            best_tracker["coverage"] = coverage
            best_tracker["iteration"] = int(flags["globalIteration"])
            best_tracker["stage"] = int(stage)
            # Detailed logging on best improvement
            try:
                if debug_log_path:
                    _append_debug_log(debug_log_path, {
                        "ts": time.time(),
                        "iteration": int(flags["globalIteration"]),
                        "stage": int(stage),
                        "rawScore": round(raw_score, 4),
                        "adjScore": round(adj_score, 4),
                        "coverage": round(coverage, 4),
                        "validationSize": validation_size,
                        "validationTotal": validation_total,
                        "contextSummary": request_context_summary,
                        "basePrompt": base_prompt_text,
                        "prompt": raw,
                        "reason": "rawImprovedAnyCoverage"
                    })
            except Exception:
                pass
            # Emergency-state snapshot update on any raw improvement
            try:
                emergency_state["bestSnapshot"] = {
                    "ts": time.time(),
                    "iteration": int(flags["globalIteration"]),
                    "stage": int(stage),
                    "rawScore": round(raw_score, 4),
                    "adjScore": round(adj_score, 4),
                    "coverage": round(coverage, 4),
                    "validationSize": validation_size,
                    "validationTotal": validation_total,
                    "contextSummary": request_context_summary,
                    "basePrompt": base_prompt_text,
                    "prompt": raw,
                    "reason": "rawImprovedAnyCoverage"
                }
            except Exception:
                pass

        # Early stopping streak on perfect coverage
        if coverage >= 0.9999:
            flags["perfectStreak"] = int(flags.get("perfectStreak", 0)) + 1
        else:
            flags["perfectStreak"] = 0

        # Persist best prompt when strong (>= 0.8 coverage) and improved raw score
        if coverage >= 0.8 and raw_score >= best_tracker.get("raw", 0.0):
            try:
                snapshot = {
                    "ts": time.time(),
                    "iteration": int(flags["globalIteration"]),
                    "stage": int(stage),
                    "rawScore": round(raw_score, 4),
                    "adjScore": round(adj_score, 4),
                    "coverage": round(coverage, 4),
                    "validationSize": validation_size,
                    "validationTotal": validation_total,
                    "contextSummary": request_context_summary,
                    "basePrompt": base_prompt_text,
                    "prompt": raw,
                    "reason": "coverageThreshold"
                }
                # Save to best prompts path (high quality snapshot)
                if best_prompts_path:
                    _append_best_prompt(best_prompts_path, snapshot)
                # Update emergency-state snapshot as well
                try:
                    emergency_state["bestSnapshot"] = snapshot
                except Exception:
                    pass
            except Exception:
                pass

        # Secondary save: ANY raw-score improvement regardless of coverage
        if raw_improved:
            try:
                snapshot_any = {
                    "ts": time.time(),
                    "iteration": int(flags["globalIteration"]),
                    "stage": int(stage),
                    "rawScore": round(raw_score, 4),
                    "adjScore": round(adj_score, 4),
                    "coverage": round(coverage, 4),
                    "validationSize": validation_size,
                    "validationTotal": validation_total,
                    "contextSummary": request_context_summary,
                    "basePrompt": base_prompt_text,
                    "prompt": raw,
                    "reason": "rawImprovedAnyCoverage"
                }
                # Save to emergency best path to guarantee persistence
                if emergency_best_path:
                    _append_best_prompt(emergency_best_path, snapshot_any)
            except Exception:
                pass

        # Periodic autosave of current best snapshot (every N iterations)
        try:
            autosave_interval = int(flags.get("autosaveInterval", 5))
        except Exception:
            autosave_interval = 5
        try:
            last_autosave_iter = int(flags.get("lastAutosaveIter", 0))
        except Exception:
            last_autosave_iter = 0
        if autosave_interval > 0 and (int(flags["globalIteration"]) - last_autosave_iter) >= autosave_interval:
            try:
                best_snap = emergency_state.get("bestSnapshot")
                if best_snap and emergency_best_path:
                    periodic = dict(best_snap)
                    periodic["ts"] = time.time()
                    periodic["reason"] = (str(periodic.get("reason") or "") + "|periodicAutosave").strip("|")
                    _append_best_prompt(emergency_best_path, periodic)
                flags["lastAutosaveIter"] = int(flags["globalIteration"])
            except Exception:
                pass

        # Emit a progress update line with best tracker
        try:
            progress_payload = {
                "type": "progress",
                "iteration": int(flags["globalIteration"]),
                "rawScore": round(raw_score, 4),
                "score": round(adj_score, 4),
                "coverage": round(coverage, 4),
                "satisfied": analysis.get("satisfied"),
                "missing": analysis.get("missing"),
                "satisfiedCount": len(analysis.get("satisfied") or []),
                "message": f"raw={raw_score:.4f} adj={adj_score:.4f} cov={coverage:.4f}{' (stage best)' if improved else ''}",
                "validationSize": validation_size,
                "validationTotal": validation_total,
                "confidence": confidence,
                "stage": stage,
                "stages": stages,
                # Best tracker fields
                "bestRawScore": round(float(best_tracker.get("raw", 0.0)), 4),
                "bestAdjScore": round(float(best_tracker.get("adj", 0.0)), 4),
                "bestCoverage": round(float(best_tracker.get("coverage", 0.0)), 4),
                "bestIteration": int(best_tracker.get("iteration", 0)),
                "bestStage": int(best_tracker.get("stage", 0)),
                "perfectStreak": int(flags.get("perfectStreak", 0)),
            }
            print(json.dumps(progress_payload), flush=True)
        except Exception:
            pass

        # Trigger early stop flag (handled after stage compile completes)
        if flags.get("perfectStreak", 0) >= int(flags.get("earlyStopThreshold", 10)):
            try:
                print(json.dumps({
                    "type": "progress",
                    "iteration": int(flags["globalIteration"]),
                    "message": f"Early stop condition reached (perfect coverage for {flags['perfectStreak']} iterations)",
                    "earlyStop": True,
                }), flush=True)
            except Exception:
                pass
            flags["earlyStop"] = True

        # Return raw score to drive optimization
        return raw_score

    return metric


def _maybe_call(obj: Any, method: str) -> None:
    try:
        func = getattr(obj, method, None)
        if callable(func):
            func()
    except Exception:
        pass


def _cleanup_resources(extra_objects: Optional[List[Any]] = None) -> None:
    """Best-effort cleanup to avoid leaked semaphores and stray processes."""

    # Clear DSPy LM configuration to prevent accidental API calls
    try:
        current_lm = dspy.settings.lm
        if current_lm:
            print(json.dumps({
                "type": "progress",
                "iteration": 0,
                "message": "Clearing DSPy LM configuration to prevent accidental API calls"
            }), flush=True)
    except Exception:
        pass

    # Release DSPy/LiteLLM resources
    try:
        dspy.settings.configure(lm=None)  # detach any global LM references
    except Exception:
        pass

    # Close/shutdown any provided objects
    for obj in extra_objects or []:
        for method in ("shutdown", "close", "terminate"):
            try:
                func = getattr(obj, method, None)
                if callable(func):
                    func()
            except Exception:
                pass

    # Terminate any active multiprocessing children with timeout
    try:
        children = mp.active_children()
        if children:
            try:
                print(json.dumps({
                    "type": "progress",
                    "iteration": 0,
                    "message": f"Terminating {len(children)} active multiprocessing children"
                }), flush=True)
            except Exception:
                pass

            # Attempt graceful termination
            for proc in children:
                try:
                    if proc.is_alive():
                        proc.terminate()
                except Exception:
                    pass

            # Wait briefly for graceful shutdown
            try:
                time.sleep(0.1)
            except Exception:
                pass

            # Force kill any remaining processes
            for proc in children:
                try:
                    if proc.is_alive():
                        proc.kill()
                except Exception:
                    pass

            # Final join with timeout
            for proc in children:
                try:
                    proc.join(timeout=1.0)
                except Exception:
                    pass
    except Exception:
        pass

    # Final GC pass
    try:
        gc.collect()
    except Exception:
        pass

    try:
        print(json.dumps({
            "type": "progress",
            "iteration": 0,
            "message": "Resource cleanup completed"
        }), flush=True)
    except Exception:
        pass


# ---------- Optimization Result Cache (JSONL, TTL + LRU) ----------

def _cache_path_from_env() -> str:
    env_path = os.environ.get("DSPY_CACHE_PATH") or ""
    if env_path.strip():
        return env_path.strip()

    # Detect serverless environment and use /tmp
    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("NETLIFY")
    )

    if is_serverless:
        base_dir = "/tmp"
    else:
        # default under this script's directory
        base_dir = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_dir, "cache", "optimizer_cache.jsonl")


def _best_prompts_path_from_env() -> str:
    """Resolve path for best prompt snapshots."""
    env_path = os.environ.get("DSPY_BEST_PROMPTS_PATH") or ""
    if env_path.strip():
        return env_path.strip()

    # Align with cache dir placement
    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("NETLIFY")
    )

    if is_serverless:
        base_dir = "/tmp"
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_dir, "cache", "best_prompts.jsonl")

def _emergency_best_prompts_path_from_env() -> str:
    """Resolve path for emergency best prompt snapshots (saved on signals/periodic autosave)."""
    env_path = os.environ.get("DSPY_EMERGENCY_BEST_PATH") or ""
    if env_path.strip():
        return env_path.strip()

    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("NETLIFY")
    )

    if is_serverless:
        base_dir = "/tmp"
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_dir, "cache", "emergency_best_prompts.jsonl")

def _debug_log_path_from_env() -> str:
    """Resolve path for detailed debug log of prompts that improved best scores."""
    env_path = os.environ.get("DSPY_DEBUG_LOG_PATH") or ""
    if env_path.strip():
        return env_path.strip()

    is_serverless = bool(
        os.environ.get("VERCEL")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("NETLIFY")
    )

    if is_serverless:
        base_dir = "/tmp"
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_dir, "cache", "optimizer_debug_prompts.jsonl")

def _append_debug_log(path: str, item: Dict[str, Any]) -> None:
    """Append a debug JSON line with locking; best-effort."""
    if not path:
        return
    directory = os.path.dirname(path)
    if directory:
        try:
            os.makedirs(directory, exist_ok=True)
        except Exception:
            pass
    line = json.dumps(item, ensure_ascii=False)
    try:
        with _file_lock_context(path, 'a') as (handle, locked):
            try:
                handle.write(line + "\n")
            except Exception:
                pass
    except Exception:
        try:
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass

def _append_best_prompt(path: str, item: Dict[str, Any]) -> None:
    """Append best prompt snapshot entry as a JSON line with locking."""
    if not path:
        return
    directory = os.path.dirname(path)
    if directory:
        try:
            os.makedirs(directory, exist_ok=True)
        except Exception:
            pass
    line = json.dumps(item, ensure_ascii=False)
    try:
        # Try append with lock
        with _file_lock_context(path, 'a') as (handle, locked):
            try:
                handle.write(line + "\n")
            except Exception:
                pass
    except Exception:
        # Fallback to simple append
        try:
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass


def _cache_iter(path: str) -> Iterable[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except Exception:
                continue


def _cache_write_all(path: str, items: List[Dict[str, Any]]) -> None:
    if not path:
        return
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    # Atomic write with locking to a process-specific temp file
    tmp = path + f".tmp.{os.getpid()}.{time.time()}"
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            lock_acquired = _acquire_file_lock(handle)
            try:
                for item in items:
                    try:
                        handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                    except Exception:
                        continue
            finally:
                if lock_acquired:
                    _release_file_lock(handle)

        os.replace(tmp, path)
    except Exception:
        # Fallback: write directly with lock
        try:
            with _file_lock_context(path, 'w') as (handle, locked):
                for item in items:
                    try:
                        handle.write(json.dumps(item, ensure_ascii=False) + "\n")
                    except Exception:
                        continue
        except Exception:
            pass
        finally:
            # Cleanup temp file if it exists
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except Exception:
                pass


def _build_cache_key(payload: Dict[str, Any]) -> str:
    """Stable hash from essential optimization parameters."""
    # Shots subset: id, timecode, label, note (stable order)
    shots = payload.get("shots", []) or []
    shots_norm = []
    for s in shots:
        shots_norm.append({
            "id": s.get("id"),
            "timecode": s.get("timecode"),
            "label": s.get("label"),
            "note": s.get("note"),
        })

    # Normalize base + references
    base_prompt = payload.get("basePrompt", {}) or {}
    reference_prompts = payload.get("referencePrompts", {}) or {}

    # Model and scoring settings
    key_obj: Dict[str, Any] = {
        "schemaType": payload.get("schemaType"),
        "enforceSchema": bool(payload.get("enforceSchema", False)),
        "titleHint": payload.get("titleHint") or "",
        "shots": shots_norm,
        "basePrompt": base_prompt,
        "referencePrompts": reference_prompts,
        "model": payload.get("model"),
        "reflectionModel": payload.get("reflectionModel"),
        "temperature": payload.get("temperature"),
        "reflectionTemperature": payload.get("reflectionTemperature"),
        "maxTokens": payload.get("maxTokens"),
        "reflectionMaxTokens": payload.get("reflectionMaxTokens"),
        "rpmLimit": payload.get("rpmLimit"),
        "jsonBonus": payload.get("jsonBonus"),
        "featureWeights": payload.get("featureWeights") or {},
        "auto": payload.get("auto"),
        "maxMetricCalls": payload.get("maxMetricCalls"),
        "seed": payload.get("seed"),
        "initialInstructions": payload.get("initialInstructions") or "",
        "experiencePath": payload.get("experiencePath") or "",
        "experienceTopK": payload.get("experienceTopK"),
        "experienceMinScore": payload.get("experienceMinScore"),
        "persistExperience": payload.get("persistExperience"),
        # Include checkpoint path as it can affect outputs if reloaded
        "checkpointPath": payload.get("checkpointPath") or "",
        # DSPy control fields that affect optimization behavior
        "alwaysFullValidation": payload.get("alwaysFullValidation"),
        "progressiveSchedule": payload.get("progressiveSchedule"),
        "minValidationSize": payload.get("minValidationSize"),
        "earlyStopOnPerfect": payload.get("earlyStopOnPerfect"),
        "earlyStopStreak": payload.get("earlyStopStreak"),
        "parallelEval": payload.get("parallelEval"),
        "parallelWorkers": payload.get("parallelWorkers"),
        "parallelBatchSize": payload.get("parallelBatchSize"),
        "evalTimeoutMs": payload.get("evalTimeoutMs"),
    }

    # Canonical JSON
    raw = json.dumps(key_obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_evict_and_prune(items: List[Dict[str, Any]], ttl_seconds: int, max_entries: int) -> List[Dict[str, Any]]:
    now = time.time()
    # Drop expired
    kept = [it for it in items if (now - float(it.get("ts", now))) <= ttl_seconds]
    # LRU eviction beyond max_entries
    if len(kept) > max_entries:
        kept.sort(key=lambda it: float(it.get("lastAccess", it.get("ts", 0.0)) or 0.0))
        kept = kept[-max_entries:]
    return kept


def _parse_schedule_env(raw: Optional[str]) -> Optional[List[float]]:
    if not raw:
        return None
    try:
        parts = [float(x.strip()) for x in raw.split(",")]
        vals = [x for x in parts if x > 0.0 and x <= 1.0]
        if not vals:
            return None
        # Ensure increasing and unique-ish
        vals = sorted(set(vals))
        if vals[-1] != 1.0:
            vals.append(1.0)
        return vals
    except Exception:
        return None


def _select_validation_subset(trainset: List[dspy.Example], extras: Dict[str, Any], fraction: float, rng: random.Random) -> List[dspy.Example]:
    """Pick a representative subset: always include request example, prefer retrieved, then diversify with foundation."""
    total = len(trainset)
    if total <= 1:
        return trainset[:]
    target = max(1, int(round(total * max(0.0, min(1.0, fraction)))))

    # Trainset layout: [foundation ...] [retrieved ...] [request_example]
    foundation_count = int(extras.get("foundationCount", 0))
    retrieved_count = int(extras.get("retrievedCount", 0))
    foundation = trainset[:foundation_count]
    retrieved = trainset[foundation_count:foundation_count + retrieved_count]
    request_example = trainset[-1]

    # Always include the request example
    subset: List[dspy.Example] = [request_example]
    remaining = max(0, target - 1)

    # Pull from retrieved first (ranked already)
    if remaining > 0 and retrieved:
        take = min(remaining, len(retrieved))
        subset.extend(retrieved[:take])
        remaining -= take

    # Fill with diversified foundation picks (evenly spaced for coverage)
    if remaining > 0 and foundation:
        if remaining >= len(foundation):
            subset.extend(foundation)
        else:
            step = max(1, len(foundation) // remaining)
            idx = 0
            picked = 0
            while picked < remaining and idx < len(foundation):
                subset.append(foundation[idx])
                picked += 1
                idx += step
            # If still short, append random distinct ones
            while picked < remaining:
                cand = foundation[rng.randrange(0, len(foundation))]
                if cand not in subset:
                    subset.append(cand)
                    picked += 1

    # Ensure unique and cap at target
    seen = set()
    uniq: List[dspy.Example] = []
    for ex in subset:
        key = id(ex)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(ex)
        if len(uniq) >= target:
            break
    return uniq


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY environment variable is required for DSPy GEPA optimization")

    # Basic hygiene: suppress non-fatal semaphore warnings and prefer safe MP start method
    try:
        import warnings as _warnings  # local import to avoid top-level changes
        _warnings.filterwarnings("ignore", message=".*semaphore.*", category=Warning)
    except Exception:
        pass
    try:
        # Set start method to 'spawn' once (safer on macOS/Serverless); ignore if already set.
        mp.set_start_method("spawn", force=False)
    except Exception:
        pass

    # Prepare emergency/debug persistence paths and shared emergency state
    emergency_best_path = _emergency_best_prompts_path_from_env()
    debug_log_path = _debug_log_path_from_env()
    emergency_state: Dict[str, Any] = {"bestSnapshot": None}

    # Install signal handlers for graceful emergency save
    def _emergency_signal_handler(signum, _frame):
        try:
            snap = emergency_state.get("bestSnapshot")
            if snap:
                meta = dict(snap)
                meta["ts"] = time.time()
                meta["signal"] = int(signum) if signum is not None else None
                meta["reason"] = (str(meta.get("reason") or "") + "|signal").strip("|")
                _append_best_prompt(emergency_best_path, meta)
                try:
                    print(json.dumps({
                        "type": "progress",
                        "iteration": 0,
                        "message": f"Emergency save on signal {signum}"
                    }), flush=True)
                except Exception:
                    pass
        except Exception:
            pass
        try:
            _cleanup_resources()
        except Exception:
            pass
        try:
            sys.exit(2)
        except Exception:
            pass

    try:
        import signal as _signal
        try:
            _signal.signal(_signal.SIGTERM, _emergency_signal_handler)  # type: ignore[arg-type]
        except Exception:
            pass
        try:
            _signal.signal(_signal.SIGINT, _emergency_signal_handler)  # type: ignore[arg-type]
        except Exception:
            pass
        try:
            sig_quit = getattr(_signal, "SIGQUIT", None)
            if sig_quit is not None:
                _signal.signal(sig_quit, _emergency_signal_handler)  # type: ignore[arg-type]
        except Exception:
            pass
    except Exception:
        pass

    # NOTE: Run DSPy GEPA prompt optimization with explicit LM configuration.
    # IMPORTANT: This function WILL make LM calls during optimization:
    # - GEPA uses the configured LM for prompt generation and evaluation
    # - ThrottledLM enforces rate limiting to prevent API quota exhaustion
    # - Heuristic scoring is used alongside LM-based evaluation for efficiency
    # Cost implications:
    # - Each optimization run may make 100-1000+ LM calls depending on settings
    # - Configure rpmLimit and maxMetricCalls to control costs
    # - Use checkpointPath to resume or persist optimizations
    # -------- Cache bootstrap --------
    cache_path = _cache_path_from_env()
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    except Exception:
        pass
    ttl_seconds = int(str(os.environ.get("DSPY_CACHE_TTL_SECONDS", 86400)))
    try:
        max_entries = int(str(os.environ.get("DSPY_CACHE_MAX", 100)))
    except Exception:
        max_entries = 100

    if bool(payload.get("clearCache", False)):
        # Clear cache file
        try:
            if os.path.exists(cache_path):
                os.remove(cache_path)
            # emit a progress line indicating clear
            print(json.dumps({"type": "progress", "iteration": 0, "message": "cache cleared"}), flush=True)
        except Exception:
            pass  # best effort

    initial_instructions = payload.get("initialInstructions") or DEFAULT_INSTRUCTIONS
    checkpoint_path = payload.get("checkpointPath")

    # Allow cache lookup for deterministic parameters
    cache_key = _build_cache_key(payload)
    cache_items = list(_cache_iter(cache_path))
    now = time.time()

    # Refresh cache: prune expired and evict to max
    cache_items = _cache_evict_and_prune(cache_items, ttl_seconds, max_entries)

    # Lookup
    hit_index = -1
    for idx, it in enumerate(cache_items):
        if it.get("key") == cache_key:
            hit_index = idx
            break

    if hit_index >= 0:
        entry = cache_items[hit_index]
        entry["lastAccess"] = now
        _cache_write_all(cache_path, cache_items)  # persist last access + pruning

        cached_result = entry.get("result") or {}
        # Add cache metadata
        try:
            print(json.dumps({"type": "progress", "iteration": 0, "message": "cache hit"}), flush=True)
        except Exception:
            pass
        cached_result["cache"] = {
            "hit": True,
            "key": cache_key,
            "ts": entry.get("ts"),
            "ageMs": int(max(0.0, (now - float(entry.get("ts", now)))) * 1000),
            "size": len(cache_items),
            "ttlMs": ttl_seconds * 1000,
        }
        return cached_result

    # -------- No cache hit; proceed with optimization --------

    model_name = payload.get("model") or "gemini/gemini-2.5-flash"
    temperature = float(payload.get("temperature", 0.2))
    max_tokens = int(payload.get("maxTokens", 32768))

    rpm_raw = payload.get("rpmLimit")
    if rpm_raw is None:
        rpm_raw = os.environ.get("DSPY_RPM_LIMIT")
    try:
        rpm_limit = max(1, int(rpm_raw))
    except (TypeError, ValueError):
        rpm_limit = 8

    forward_rate_limiter = RateLimiter(rpm_limit)
    forward_lm = ThrottledLM(
        model=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        cache=False,
        rate_limiter=forward_rate_limiter,
    )

    dspy.settings.configure(lm=forward_lm)

    try:
        print(json.dumps({
            "type": "progress",
            "iteration": 0,
            "message": f"DSPy configured with LM: {model_name} (temp={temperature}, rpm_limit={rpm_limit})"
        }), flush=True)
    except Exception:
        pass

    try:
        current_lm = dspy.settings.lm
        if current_lm is None:
            print(json.dumps({
                "type": "progress",
                "iteration": 0,
                "message": "WARNING: DSPy LM is None - GEPA may not function properly"
            }), flush=True)
        else:
            print(json.dumps({
                "type": "progress",
                "iteration": 0,
                "message": f"DSPy LM configured: {type(current_lm).__name__}"
            }), flush=True)
    except Exception:
        pass

    reflection_model = payload.get("reflectionModel") or model_name
    reflection_temperature = float(payload.get("reflectionTemperature", 0.7))
    reflection_max_tokens = int(payload.get("reflectionMaxTokens", 32768))

    if reflection_model == model_name:
        reflection_rate_limiter = forward_rate_limiter
    else:
        reflection_rate_limiter = RateLimiter(rpm_limit)

    reflection_lm = ThrottledLM(
        model=reflection_model,
        temperature=reflection_temperature,
        max_tokens=reflection_max_tokens,
        cache=False,
        rate_limiter=reflection_rate_limiter,
    )

    trainset, request_context_summary, base_prompt_text, request_features, extras = _build_trainset(payload)

    # Implement usage count tracking: bump usage for retrieved records used in training
    try:
        retrieved_records_meta = extras.get("retrieved") or []
        experience_path_for_bump = extras.get("experiencePath") or payload.get("experiencePath") or os.environ.get("DSPY_EXPERIENCE_PATH")
        ids_to_bump = [str(r.get("id")) for r in retrieved_records_meta if r.get("id")]
        if experience_path_for_bump and ids_to_bump:
            _bump_usage_counts(experience_path_for_bump, ids_to_bump)
    except Exception:
        pass

    # JSON bonus reduction to 0.20 (can be overridden by payload.jsonBonus)
    json_bonus = float(payload.get("jsonBonus", 0.2))
    computed_weights = extras.get("featureWeightsByText")
    if not isinstance(computed_weights, dict):
        computed_weights = None

    # Progressive validation configuration with minimum size
    always_full = bool(payload.get("alwaysFullValidation", False) or os.environ.get("DSPY_ALWAYS_FULL_VALIDATION") in ("1", "true", "True"))
    schedule = payload.get("progressiveSchedule")
    if not isinstance(schedule, list):
        schedule = None
    if schedule:
        try:
            schedule = [float(x) for x in schedule]
            schedule = [x for x in schedule if x > 0.0 and x <= 1.0]
            schedule = sorted(set(schedule))
            if not schedule:
                schedule = None
            elif schedule[-1] != 1.0:
                schedule.append(1.0)
        except Exception:
            schedule = None
    if not schedule:
        env_schedule = _parse_schedule_env(os.environ.get("DSPY_PROGRESSIVE_SCHEDULE"))
        # Default to a larger first-stage validation to avoid 2/7 overfitting
        schedule = env_schedule if env_schedule else [0.5, 1.0]
    if always_full:
        schedule = [1.0]

    # Enforce minimum validation size (default 4, configurable via payload/env)
    try:
        min_val_env = os.environ.get("DSPY_MIN_VALIDATION_SIZE", "")
        min_validation_size = int(payload.get("minValidationSize", int(min_val_env) if str(min_val_env).isdigit() else 4))
    except Exception:
        min_validation_size = 4

    # Early stopping configuration (perfect coverage streak)
    early_stop_enabled = bool(payload.get("earlyStopOnPerfect", True) or os.environ.get("DSPY_EARLY_STOP_ON_PERFECT") in ("1", "true", "True"))
    try:
        perfect_streak_threshold_env = os.environ.get("DSPY_EARLY_STOP_STREAK", "")
        perfect_streak_threshold = int(payload.get("earlyStopStreak", int(perfect_streak_threshold_env) if str(perfect_streak_threshold_env).isdigit() else 10))
    except Exception:
        perfect_streak_threshold = 10

    # Allocate metric call budget per stage (favor later stages mildly)
    total_calls_raw = payload.get("maxMetricCalls")
    total_calls = int(total_calls_raw) if isinstance(total_calls_raw, (int, float)) and int(total_calls_raw) > 0 else 600
    weights = [max(0.1, float(f)) for f in schedule]  # proportional to fraction
    wsum = sum(weights) or 1.0
    stage_calls = [max(10, int(round(total_calls * (w / wsum)))) for w in weights]
    # Normalize to total_calls
    diff = total_calls - sum(stage_calls)
    if diff != 0 and stage_calls:
        stage_calls[-1] = max(10, stage_calls[-1] + diff)

    try:
        estimated_calls = min(int(total_calls), int(len(trainset) * 10))
    except Exception:
        estimated_calls = int(total_calls) if isinstance(total_calls, (int, float)) else 0
    try:
        print(json.dumps({
            "type": "progress",
            "iteration": 0,
            "message": f"Starting GEPA optimization (estimated ~{estimated_calls} LM calls, rpm_limit={rpm_limit})"
        }), flush=True)
    except Exception:
        pass

    # Progressive compile
    optimized_program: Any = None
    rng = random.Random(int(payload.get("seed", random.randint(0, 10_000))))
    # Global trackers shared with the metric closure
    best_tracker: Dict[str, Any] = {"iteration": 0, "raw": 0.0, "adj": 0.0, "coverage": 0.0, "stage": 0}
    flags: Dict[str, Any] = {
        "globalIteration": 0,
        "perfectStreak": 0,
        "earlyStop": False,
        "earlyStopThreshold": int(perfect_streak_threshold),
        "emergencyState": emergency_state,
        "emergencyBestPath": emergency_best_path,
        "debugLogPath": debug_log_path,
        "autosaveInterval": 5,
        "lastAutosaveIter": 0,
        "optimizing": False,
    }
    best_prompts_path = _best_prompts_path_from_env()

    for idx, frac in enumerate(schedule):
        subset = _select_validation_subset(trainset, extras, float(frac), rng)
        # Enforce minimum size
        if len(subset) < min_validation_size and len(trainset) >= min_validation_size:
            # Rebuild subset to meet minimum: include request + top retrieved + diversified foundation
            subset = _select_validation_subset(trainset, extras, 1.0 if (min_validation_size >= len(trainset)) else float(frac), rng)
            if len(subset) > min_validation_size:
                subset = subset[:min_validation_size]

        validation_size = len(subset)
        validation_total = len(trainset)

        # Emit a stage start progress line
        try:
            print(json.dumps({
                "type": "progress",
                "iteration": int(flags.get("globalIteration", 0)),
                "message": f"stage {idx + 1}/{len(schedule)} start: val {validation_size}/{validation_total}",
                "validationSize": validation_size,
                "validationTotal": validation_total,
                "confidence": max(0.0, min(1.0, validation_size / max(1, validation_total))),
                "stage": idx + 1,
                "stages": len(schedule),
            }), flush=True)
        except Exception:
            pass

        metric = _prepare_metric(
            json_bonus,
            computed_weights,
            validation_size,
            validation_total,
            idx + 1,
            len(schedule),
            best_tracker=best_tracker,
            flags=flags,
            best_prompts_path=best_prompts_path,
            request_context_summary=request_context_summary,
            base_prompt_text=base_prompt_text,
        )

        # Use auto if provided, otherwise use max_metric_calls (GEPA requires exactly one)
        gepa_kwargs = {
            "metric": metric,
            "reflection_lm": reflection_lm,
            "seed": int(payload.get("seed", random.randint(0, 10_000))),
            "track_stats": False,
            "skip_perfect_score": True,
            "add_format_failure_as_feedback": True,
        }

        if payload.get("auto"):
            gepa_kwargs["auto"] = payload.get("auto")
        else:
            gepa_kwargs["max_metric_calls"] = stage_calls[idx]

        gepa = GEPA(**gepa_kwargs)

        program_input = optimized_program if optimized_program is not None else PromptOptimizer(initial_instructions)
        # Load checkpoint only on the first stage
        if optimized_program is None and checkpoint_path and os.path.exists(checkpoint_path):
            try:
                program_input.load(checkpoint_path)  # type: ignore[attr-defined]
            except Exception:
                pass

        optimized_program = gepa.compile(program_input, trainset=subset)  # type: ignore[arg-type]

        # Early stop if perfect streak achieved (only break between stages)
        if early_stop_enabled and flags.get("earlyStop", False):
            try:
                print(json.dumps({
                    "type": "progress",
                    "iteration": int(flags.get("globalIteration", 0)),
                    "message": f"Early stopping after stage {idx + 1}: perfect coverage streak {flags.get('perfectStreak', 0)}",
                    "earlyStop": True,
                }), flush=True)
            except Exception:
                pass
            break

        # Save checkpoint after last stage only (best result)
        if (idx == len(schedule) - 1) and checkpoint_path:
            try:
                directory = os.path.dirname(checkpoint_path)
                if directory:
                    os.makedirs(directory, exist_ok=True)
                optimized_program.save(checkpoint_path)  # type: ignore[attr-defined]
            except Exception:
                pass

    # Evaluate the final optimized program
    try:
        prediction = optimized_program(
            context_summary=request_context_summary,
            base_prompt=base_prompt_text,
            optimization_brief="\n".join(f"- {item}" for item in request_features),
        )
    except Exception as exc:
        raise RuntimeError(f"Final evaluation failed: {exc}")

    raw_prompt = getattr(prediction, "optimized_prompt", "")
    final_analysis = _analyze_output(raw_prompt, request_features, json_bonus=json_bonus, feature_weights=computed_weights)

    # Update emergency state with final best if strong
    try:
        snapshot_final = {
            "ts": time.time(),
            "iteration": int(flags.get("globalIteration", 0)),
            "stage": int(best_tracker.get("stage", 0)),
            "rawScore": round(float(final_analysis.get("score") or 0.0), 4),
            "adjScore": round(float(best_tracker.get("adj", 0.0)), 4),
            "coverage": round(float(final_analysis.get("coverage") or 0.0), 4),
            "validationSize": len(trainset),
            "validationTotal": len(trainset),
            "contextSummary": request_context_summary,
            "basePrompt": base_prompt_text,
            "prompt": raw_prompt,
            "reason": "finalEvaluation"
        }
        emergency_state["bestSnapshot"] = snapshot_final
    except Exception:
        pass

    # Optional parallel evaluation across all trainset feature sets (local scoring only)
    parallel_enabled = bool(payload.get("parallelEval", False) or os.environ.get("DSPY_PARALLEL") in ("1", "true", "True"))
    workers_env = os.environ.get("DSPY_PARALLEL_WORKERS")
    batch_env = os.environ.get("DSPY_PARALLEL_BATCH_SIZE")
    timeout_env = os.environ.get("DSPY_EVAL_TIMEOUT_MS")
    try:
        default_workers = max(2, min(8, (os.cpu_count() or 4) - 1))
    except Exception:
        default_workers = 4
    parallel_workers = int(payload.get("parallelWorkers", int(workers_env) if (workers_env or "").isdigit() else default_workers))
    parallel_batch = int(payload.get("parallelBatchSize", int(batch_env) if (batch_env) and str(batch_env).isdigit() else 8))
    parallel_timeout_s = float(payload.get("evalTimeoutMs", int(timeout_env) if (timeout_env) and str(timeout_env).isdigit() else 15000)) / 1000.0

    parallel_meta: Dict[str, Any] = {"enabled": False}
    if parallel_enabled:
        # Build feature sets for all training examples
        feature_sets: List[List[str]] = []
        for ex in trainset:
            feats = getattr(ex, "expected_keywords", None)
            if isinstance(feats, list):
                cleaned = [str(f).strip() for f in feats if str(f).strip()]
                feature_sets.append(cleaned)
            else:
                feature_sets.append([])
        try:
            results, meta = _parallel_evaluate_prompt(
                raw_prompt,
                feature_sets,
                json_bonus=json_bonus,
                feature_weights=computed_weights,
                workers=parallel_workers,
                batch_size=parallel_batch,
                timeout_s=max(1.0, parallel_timeout_s),
            )
            if results:
                score_avg = sum(float(r.get("score", 0.0) or 0.0) for r in results) / max(1, len(results))
                coverage_avg = sum(float(r.get("coverage", 0.0) or 0.0) for r in results) / max(1, len(results))
                final_analysis["scoreParallelAvg"] = round(score_avg, 4)
                final_analysis["coverageParallelAvg"] = round(coverage_avg, 4)
                final_analysis["parallelEvaluated"] = meta.get("evaluated", len(results))
                final_analysis["parallelWorkers"] = meta.get("workers", parallel_workers)
                final_analysis["parallelBatchSize"] = meta.get("batch", parallel_batch)
                parallel_meta = {"enabled": True, **meta}
            else:
                parallel_meta = {"enabled": True, "evaluated": 0, "workers": parallel_workers, "batch": parallel_batch}
        except Exception as exc:
            # Graceful fallback; attach a note for debugging
            final_analysis["parallelError"] = str(exc)
            parallel_meta = {"enabled": True, "error": str(exc)}

    # Save strong experiences and prune store (unchanged)
    try:
        experience_path = extras.get("experiencePath") or payload.get("experiencePath") or os.environ.get("DSPY_EXPERIENCE_PATH")
        if payload.get("persistExperience", True) and experience_path:
            # Preferred override from payload/env
            try:
                save_threshold = float(payload.get("experienceSaveThreshold", os.environ.get("DSPY_EXPERIENCE_SAVE_THRESHOLD", None)))
            except Exception:
                save_threshold = None
            if save_threshold is None:
                try:
                    save_threshold = float(payload.get("experienceMinScore", os.environ.get("DSPY_EXPERIENCE_MIN_SCORE", 0.5)))
                except Exception:
                    save_threshold = 0.5

            score_val = float(final_analysis.get("score") or 0.0)
            parsed_ok = bool(final_analysis.get("parsed"))
            save_ok = parsed_ok and (score_val >= float(save_threshold))

            if save_ok:
                exp_record = {
                    "id": _generate_id(),
                    "ts": time.time(),
                    "usageCount": 0,
                    "schemaType": extras.get("schemaType") or payload.get("schemaType", "tutorial"),
                    "context_summary": request_context_summary,
                    "base_prompt": base_prompt_text,
                    "optimization_brief": "\n".join(f"- {item}" for item in request_features),
                    "expected_keywords": request_features,
                    "raw": raw_prompt,
                    "persona": final_analysis.get("persona"),
                    "requirements": final_analysis.get("requirements"),
                    "requirementsList": final_analysis.get("requirementsList"),
                    "fallbackOutput": final_analysis.get("fallbackOutput"),
                    "fallbackOutputJson": final_analysis.get("fallbackOutputJson"),
                    "styleGuide": final_analysis.get("styleGuide"),
                    "parsed": final_analysis.get("parsed"),
                    "score": final_analysis.get("score"),
                    "coverage": final_analysis.get("coverage"),
                }
                _append_experience(experience_path, exp_record)

            prune_threshold_value = None
            raw_prune = payload.get("experiencePruneThreshold", os.environ.get("DSPY_EXPERIENCE_PRUNE_THRESHOLD", None))
            if raw_prune is not None:
                try:
                    prune_threshold_value = float(raw_prune)
                except Exception:
                    prune_threshold_value = None
            if prune_threshold_value is None:
                prune_threshold_value = float(save_threshold)

            try:
                max_age_days_raw = payload.get("experienceMaxAge") or os.environ.get("DSPY_EXPERIENCE_MAX_AGE_DAYS", 30)
                max_age_days = int(max_age_days_raw) if str(max_age_days_raw).isdigit() else int(30)
            except Exception:
                max_age_days = 30
            _prune_experiences(experience_path, prune_threshold=prune_threshold_value, max_age_days=max_age_days)
    except Exception:
        pass

    # Base result without cache metadata (unchanged)
    result = {
        "ok": True,
        "optimizedPrompt": {
            "persona": final_analysis.get("persona"),
            "requirements": final_analysis.get("requirements"),
            "requirementsList": final_analysis.get("requirementsList"),
            "fallbackOutput": final_analysis.get("fallbackOutput"),
            "fallbackOutputJson": final_analysis.get("fallbackOutputJson"),
            "styleGuide": final_analysis.get("styleGuide"),
            "raw": raw_prompt,
        },
        "analysis": {
            "score": final_analysis.get("score"),
            "coverage": final_analysis.get("coverage"),
            "parsed": final_analysis.get("parsed"),
            "parseError": final_analysis.get("parseError"),
            "feedback": final_analysis.get("feedback"),
            "satisfied": final_analysis.get("satisfied"),
            "missing": final_analysis.get("missing"),
            "auto": payload.get("auto"),
            "trainsetSize": len(trainset),
            "requestedModel": model_name,
            "retrievedFromExperience": extras.get("retrievedCount", 0),
            # Parallel evaluation (if enabled)
            "scoreParallelAvg": final_analysis.get("scoreParallelAvg"),
            "coverageParallelAvg": final_analysis.get("coverageParallelAvg"),
            "parallelEvaluated": final_analysis.get("parallelEvaluated"),
            "parallelWorkers": final_analysis.get("parallelWorkers"),
            "parallelBatchSize": final_analysis.get("parallelBatchSize"),
            "parallelMeta": parallel_meta,
        },
        "baselinePrompt": payload.get("basePrompt"),
    }

    # Write to cache (unchanged)
    try:
        cache_items = [it for it in cache_items if it.get("key") != cache_key]
        cache_items.append({
            "key": cache_key,
            "ts": now,
            "lastAccess": now,
            "result": result,
        })
        cache_items = _cache_evict_and_prune(cache_items, ttl_seconds, max_entries)
        _cache_write_all(cache_path, cache_items)
    except Exception:
        pass

    result["cache"] = {
        "hit": False,
        "key": cache_key,
        "ts": now,
        "ageMs": 0,
        "size": len(cache_items),
        "ttlMs": ttl_seconds * 1000,
    }

    return result


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:  # pragma: no cover - invalid input guard
        print(json.dumps({"error": f"Invalid JSON payload: {exc}"}), file=sys.stderr)
        sys.exit(1)

    try:
        result = run(payload)
    except Exception as exc:  # pragma: no cover - runtime guard
        debug = payload.get("debug", False)
        message = f"DSPy optimization failed: {exc}"
        if debug:
            import traceback

            traceback.print_exc()
        print(json.dumps({"error": message}), file=sys.stderr)
        sys.exit(1)

    # Best-effort cleanup after successful run
    try:
        _cleanup_resources()
    except Exception:
        pass

    print(json.dumps(result))


if __name__ == "__main__":  # pragma: no cover - script entry point
    main()
