#!/usr/bin/env python3
"""DSPy GEPA prompt optimizer for Gemini instructions.

This script reads JSON payloads from stdin and returns optimized prompt
components suitable for the Next.js API route. It relies on DSPy 3 + GEPA
and expects the `GEMINI_API_KEY` to be available for the underlying
LiteLLM-backed Gemini models.
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import textwrap
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from json_repair import repair_json

try:
    import dspy
    from dspy.teleprompt import GEPA
except Exception as exc:  # pragma: no cover - import guard
    print(json.dumps({"error": f"DSPy import failed: {exc}"}), file=sys.stderr)
    sys.exit(1)


DEFAULT_INSTRUCTIONS = textwrap.dedent(
    """
    You are rewriting a system prompt that will be sent directly to Gemini.
    Blend the base instructions with the optimization brief, making sure the
    final guidance is specific, grounded, and pragmatic. Preserve the original
    intent, but clarify any weak points called out in the brief.

    Return STRICT JSON with the keys:
      - persona (string)
      - requirements (string with newline-separated bullet points)
      - fallbackOutput (string)
      - styleGuide (string, optional)

    Do not invent data beyond what is provided. Explicitly mention screenshots
    only when they appear in the brief. When schema enforcement is enabled,
    remind Gemini to return valid JSON and repair minor format issues. When the
    brief allows Markdown, highlight the expected structure. Keep the language
    confident and actionable.
    """
).strip()


@dataclass
class PromptConfig:
    persona: str
    requirements: str
    fallback_output: str
    style_guide: Optional[str] = None


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


def _parse_prompt_json(raw_text: str) -> Tuple[Optional[PromptConfig], bool, Optional[str]]:
    cleaned = _strip_code_fence(raw_text)
    if not cleaned:
        return None, False, "Empty response"

    parse_error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

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

    persona = str(data.get("persona", "")).strip()
    requirements = data.get("requirements", "")
    if isinstance(requirements, list):
        requirements = "\n".join(str(item).strip() for item in requirements if str(item).strip())
    requirements = str(requirements).strip()
    fallback_output = str(data.get("fallbackOutput", data.get("fallback", ""))).strip()
    style = data.get("styleGuide")
    if isinstance(style, list):
        style = "\n".join(str(item).strip() for item in style if str(item).strip())
    style = str(style).strip() if style else None

    return PromptConfig(persona=persona, requirements=requirements, fallback_output=fallback_output, style_guide=style), True, parse_error


def _build_features(payload: Dict[str, Any]) -> List[str]:
    schema_type = payload.get("schemaType", "tutorial")
    enforce_schema = bool(payload.get("enforceSchema", False))
    title_hint = payload.get("titleHint", "").strip()
    shots: List[Dict[str, Any]] = payload.get("shots", []) or []

    schema_focus = {
        "tutorial": "Deliver a step-by-step tutorial grounded in the recording",
        "meetingSummary": "Produce an executive-ready meeting summary with clear sections",
    }.get(schema_type, "Deliver the requested output with clear structure")

    features: List[str] = [schema_focus]
    if shots:
        ids = ", ".join(str(shot.get("id")) for shot in shots if shot.get("id"))
        features.append(f"Explicitly reference screenshot IDs exactly as provided ({ids}) when relevant")
        features.append("Use screenshot timecodes to reinforce chronological ordering")
    else:
        features.append("Clarify that screenshots may be absent and the video timeline should drive structure")

    if title_hint:
        features.append(f"Respect the optional title hint \"{title_hint}\" without copying verbatim")

    if enforce_schema:
        features.append("Remind Gemini to return STRICT JSON that matches the schema and repair minor formatting issues")
    else:
        features.append("Allow richly formatted Markdown when JSON enforcement is off, but keep sections explicit")

    features.append("Emphasize grounding in both the video actions and any captured screenshots")

    return features


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


def _analyze_output(raw_text: str, features: List[str]) -> Dict[str, Any]:
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
        json_bonus = 0.25
    else:
        combined_text = raw_text
        json_bonus = 0.0

    hits: List[str] = []
    missing: List[str] = []
    lowered = combined_text.lower()
    for feature in features:
        normalized = feature.lower()
        if normalized and normalized in lowered:
            hits.append(feature)
        else:
            missing.append(feature)

    coverage = len(hits) / len(features) if features else 1.0
    score = min(1.0, coverage + json_bonus)

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
    }


def _build_trainset(payload: Dict[str, Any]) -> Tuple[List[dspy.Example], str, str, List[str]]:
    reference_prompts: Dict[str, Any] = payload.get("referencePrompts", {}) or {}
    shots = payload.get("shots", []) or []

    foundation_examples: List[dspy.Example] = []
    for schema_key, config in reference_prompts.items():
        base_prompt_text = _compose_prompt_text(config)
        friendly = "step-by-step tutorial" if schema_key == "tutorial" else "executive-ready meeting summary"
        features = [
            f"Keep the persona oriented around an {friendly}",
            "Spell out how to cite screenshot IDs exactly as provided",
            "Mention grounding in both timeline and screenshots",
            "Clarify how to behave when JSON schema enforcement is toggled",
        ]
        foundation_examples.append(
            dspy.Example(
                context_summary=(
                    f"We are optimizing prompts for {friendly} outputs generated from product recordings. "
                    "Screenshots typically include identifiers such as s1, s2, s3 with associated timecodes."
                ),
                base_prompt=base_prompt_text,
                optimization_brief="\n".join(f"- {item}" for item in features),
                expected_keywords=features,
            ).with_inputs("context_summary", "base_prompt", "optimization_brief")
        )

    base_prompt = payload.get("basePrompt") or reference_prompts.get(payload.get("schemaType")) or {}
    base_prompt_text = _compose_prompt_text(base_prompt)
    features = _build_features(payload)
    shots_summary = _summarize_shots(shots)

    enforce_schema = bool(payload.get("enforceSchema", False))
    title_hint = payload.get("titleHint", "").strip()
    schema_type = payload.get("schemaType", "tutorial")
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

    trainset = foundation_examples + [request_example]
    return trainset, request_context_summary, base_prompt_text, features


def _prepare_metric() -> Any:
    def metric(gold: dspy.Example, pred: dspy.Prediction, *_: Any, **__: Any) -> Dict[str, Any]:
        raw = getattr(pred, "optimized_prompt", "")
        features = getattr(gold, "expected_keywords", []) or []
        analysis = _analyze_output(raw, features)
        return {"score": analysis["score"], "feedback": analysis["feedback"]}

    return metric


def _make_signature(initial_instructions: str):
    class PromptOptimizationSignature(dspy.Signature):
        """Rewrite Gemini system prompts so that they satisfy detailed briefs."""

        context_summary = dspy.InputField(desc="Summary of the scenario we are optimizing for.")
        base_prompt = dspy.InputField(desc="The prompt currently used to steer Gemini.")
        optimization_brief = dspy.InputField(desc="Bullet list describing every improvement that must be reflected.")
        optimized_prompt = dspy.OutputField(
            desc=(
                "Return STRICT JSON with persona, requirements, fallbackOutput, and optional styleGuide fields. "
                "Requirements must remain newline-separated bullet points."
            )
        )

        instructions = initial_instructions

    return PromptOptimizationSignature


class PromptOptimizer(dspy.Module):
    def __init__(self, instructions: str):
        super().__init__()
        signature_cls = _make_signature(instructions)
        self.rewrite = dspy.Predict(signature_cls)

    def forward(self, context_summary: str, base_prompt: str, optimization_brief: str) -> dspy.Prediction:
        return self.rewrite(
            context_summary=context_summary,
            base_prompt=base_prompt,
            optimization_brief=optimization_brief,
        )


def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY environment variable is required for DSPy GEPA optimization")

    initial_instructions = payload.get("initialInstructions") or DEFAULT_INSTRUCTIONS

    model_name = payload.get("model") or "gemini/gemini-2.0-flash-exp"
    temperature = float(payload.get("temperature", 0.2))
    max_tokens = int(payload.get("maxTokens", 2048))

    dspy.settings.configure(
        lm=dspy.LM(model=model_name, temperature=temperature, max_tokens=max_tokens, cache=False)
    )

    reflection_model = payload.get("reflectionModel") or payload.get("model") or model_name
    reflection_temperature = float(payload.get("reflectionTemperature", 0.7))
    reflection_max_tokens = int(payload.get("reflectionMaxTokens", 4096))

    reflection_lm = dspy.LM(
        model=reflection_model,
        temperature=reflection_temperature,
        max_tokens=reflection_max_tokens,
        cache=False,
    )

    trainset, request_context_summary, base_prompt_text, request_features = _build_trainset(payload)

    metric = _prepare_metric()

    optimizer = PromptOptimizer(initial_instructions)

    auto = payload.get("auto")
    max_metric_calls = payload.get("maxMetricCalls")
    if not auto and not max_metric_calls:
        auto = "light"

    gepa = GEPA(
        metric=metric,
        auto=auto,
        max_metric_calls=max_metric_calls,
        reflection_lm=reflection_lm,
        seed=int(payload.get("seed", random.randint(0, 10_000))),
        track_stats=False,
        skip_perfect_score=True,
        add_format_failure_as_feedback=True,
    )

    optimized_program = gepa.compile(optimizer, trainset=trainset)

    prediction = optimized_program(
        context_summary=request_context_summary,
        base_prompt=base_prompt_text,
        optimization_brief="\n".join(f"- {item}" for item in request_features),
    )

    raw_prompt = getattr(prediction, "optimized_prompt", "")
    final_analysis = _analyze_output(raw_prompt, request_features)

    result = {
        "ok": True,
        "optimizedPrompt": {
            "persona": final_analysis.get("persona"),
            "requirements": final_analysis.get("requirements"),
            "fallbackOutput": final_analysis.get("fallbackOutput"),
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
            "auto": auto,
            "trainsetSize": len(trainset),
            "requestedModel": model_name,
        },
        "baselinePrompt": payload.get("basePrompt"),
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

    print(json.dumps(result))


if __name__ == "__main__":  # pragma: no cover - script entry point
    main()
