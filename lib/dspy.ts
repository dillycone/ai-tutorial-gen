// lib/dspy.ts
import { spawn } from "child_process";
import { join } from "path";

import { SchemaType } from "@/lib/types";

export type PromptShotSummary = {
  id: string;
  timecode?: string;
  label?: string;
  note?: string;
};

export type PromptBlueprint = {
  persona: string;
  requirements: string;
  fallbackOutput: string;
  styleGuide?: string;
  hintLabel?: string;
};

export type DspyAnalysis = {
  score?: number;
  coverage?: number;
  parsed?: boolean;
  parseError?: string;
  feedback?: string;
  satisfied?: string[];
  missing?: string[];
  auto?: string | null;
  trainsetSize?: number;
  requestedModel?: string;
  retrievedFromExperience?: number;
};

export type OptimizedPrompt = {
  persona?: string | null;
  requirements?: string | null;
  requirementsList?: string[] | null;
  fallbackOutput?: string | null;
  fallbackOutputJson?: unknown;
  styleGuide?: string | null;
  raw?: string;
};

export type DspyProgress = {
  iteration: number;
  rawScore?: number;
  score?: number;
  coverage?: number;
  satisfied?: string[];
  missing?: string[];
  satisfiedCount?: number;
  message?: string;
  validationSize?: number;
  validationTotal?: number;
  confidence?: number;
  stage?: number;
  stages?: number;
  // New best-tracker fields
  bestRawScore?: number;
  bestAdjScore?: number;
  bestCoverage?: number;
  bestIteration?: number;
  bestStage?: number;
  perfectStreak?: number;
  earlyStop?: boolean;
};

export type DspyOptimizationResult = {
  optimizedPrompt?: OptimizedPrompt;
  analysis?: DspyAnalysis;
  baselinePrompt?: PromptBlueprint;
  progress?: DspyProgress[];
  cache?: {
    hit?: boolean;
    key?: string;
    ts?: number;
    ageMs?: number;
    size?: number;
    ttlMs?: number;
    cleared?: boolean;
  };
  comparison?: DspyPromptComparison; // Added: baseline vs optimized comparison payload
};

export type DspyPromptComparison = {
  baselineText: string;
  optimizedText: string;
  unifiedDiff: string;
  sections: {
    persona: { baseline: string; optimized: string };
    requirements: { baseline: string; optimized: string };
    fallbackOutput: { baseline: string; optimized: string };
    styleGuide: { baseline: string; optimized: string };
  };
};

export type DspyOptimizationPayload = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  titleHint?: string;
  shots: PromptShotSummary[];
  basePrompt: PromptBlueprint;
  referencePrompts: Record<SchemaType, PromptBlueprint>;
  // Persistence + retrieval controls
  checkpointPath?: string;
  experiencePath?: string;
  experienceTopK?: number;
  experienceMinScore?: number;
  persistExperience?: boolean;
  rpmLimit?: number;
  model?: string;
  reflectionModel?: string;
  temperature?: number;
  reflectionTemperature?: number;
  maxTokens?: number;
  reflectionMaxTokens?: number;
  // Scoring + analysis customization
  jsonBonus?: number;
  featureWeights?: Record<string, number>;
  // Experience management
  experiencePruneThreshold?: number; // default 0.5
  experienceMaxAge?: number; // days, default 30
  // GEPA configuration
  auto?: "light" | "medium" | "heavy" | null;
  maxMetricCalls?: number | null;
  seed?: number;
  initialInstructions?: string;
  timeoutMs?: number;
  debug?: boolean;
  // Progressive validation config
  alwaysFullValidation?: boolean;
  progressiveSchedule?: number[];
  minValidationSize?: number; // New: enforce minimum validation set size
  // Early stop
  earlyStopOnPerfect?: boolean;
  earlyStopStreak?: number;
  // Parallel evaluation (local scoring) configuration
  parallelEval?: boolean;
  parallelWorkers?: number;
  parallelBatchSize?: number;
  evalTimeoutMs?: number;
  // Cache controls (optional)
  clearCache?: boolean;
};

const PYTHON_TIMEOUT_FALLBACK_MS = Number(process.env.DSPY_TIMEOUT_MS ?? 600_000); // 10 minutes default

function buildPythonEnv(): NodeJS.ProcessEnv {
  const projectRoot = process.cwd();
  const pythonPathEntries = [join(projectRoot, ".python_lib")];
  const existing = process.env.PYTHONPATH;
  if (existing) pythonPathEntries.push(existing);
  const separator = process.platform === "win32" ? ";" : ":";

  return {
    ...process.env,
    PYTHONPATH: pythonPathEntries.join(separator),
    DSPY_EXPERIENCE_PATH: process.env.DSPY_EXPERIENCE_PATH || "",
    DSPY_PARALLEL: process.env.DSPY_PARALLEL || "threads",
  };
}

// Helper functions for prompt comparison (unchanged from prior addition)
function composeBlueprintText(bp?: PromptBlueprint | null): string {
  if (!bp) return "";
  const persona = (bp.persona ?? "").trim();
  const requirements = (bp.requirements ?? "").trim();
  const fallback = (bp.fallbackOutput ?? "").trim();
  const style = (bp.styleGuide ?? "").trim();

  const parts: string[] = [];
  if (persona) parts.push("Persona:\n" + persona);
  if (requirements) parts.push("Requirements:\n" + requirements);
  if (fallback) parts.push("Fallback Output:\n" + fallback);
  if (style) parts.push("Style Guide:\n" + style);
  return parts.join("\n\n");
}

function stringifyFallbackOutput(p: OptimizedPrompt | undefined): string {
  if (!p) return "";
  if (typeof p.fallbackOutputJson !== "undefined" && p.fallbackOutputJson !== null) {
    try {
      return JSON.stringify(p.fallbackOutputJson, null, 2);
    } catch {
      // ignore stringify errors
    }
  }
  return String(p?.fallbackOutput ?? "").trim();
}

function composeOptimizedText(op?: OptimizedPrompt | null): string {
  if (!op) return "";
  const raw = String(op.raw ?? "").trim();
  if (raw) return raw;

  const persona = String(op.persona ?? "").trim();
  let requirements = String(op.requirements ?? "").trim();
  if (!requirements && Array.isArray(op.requirementsList) && op.requirementsList.length > 0) {
    requirements = op.requirementsList.map((r) => `- ${String(r).trim()}`).join("\n");
  }
  const fallback = stringifyFallbackOutput(op);
  const style = String(op.styleGuide ?? "").trim();

  const parts: string[] = [];
  if (persona) parts.push("Persona:\n" + persona);
  if (requirements) parts.push("Requirements:\n" + requirements);
  if (fallback) parts.push("Fallback Output:\n" + fallback);
  if (style) parts.push("Style Guide:\n" + style);
  return parts.join("\n\n");
}

// Simple unified diff (line-based) using LCS
function computeUnifiedDiff(aText: string, bText: string): string {
  const a = (aText || "").split(/\r?\n/);
  const b = (bText || "").split(/\r?\n/);
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(" " + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push("- " + a[i]);
      i++;
    } else {
      out.push("+ " + b[j]);
      j++;
    }
  }
  while (i < m) {
    out.push("- " + a[i]);
    i++;
  }
  while (j < n) {
    out.push("+ " + b[j]);
    j++;
  }

  return out.join("\n");
}

export function buildPromptComparison(
  baseline: PromptBlueprint,
  optimized?: OptimizedPrompt,
): DspyPromptComparison {
  const baselineText = composeBlueprintText(baseline);
  const optimizedText = composeOptimizedText(optimized);

  const personaBaseline = String(baseline?.persona ?? "").trim();
  const personaOptimized = String(optimized?.persona ?? "").trim();

  const reqBaseline = String(baseline?.requirements ?? "").trim();
  let reqOptimized = String(optimized?.requirements ?? "").trim();
  if (!reqOptimized && Array.isArray(optimized?.requirementsList) && optimized?.requirementsList?.length) {
    reqOptimized = (optimized?.requirementsList ?? []).map((r) => `- ${String(r).trim()}`).join("\n");
  }

  const fallbackBaseline = String(baseline?.fallbackOutput ?? "").trim();
  const fallbackOptimized = stringifyFallbackOutput(optimized);

  const styleBaseline = String(baseline?.styleGuide ?? "").trim();
  const styleOptimized = String(optimized?.styleGuide ?? "").trim();

  return {
    baselineText,
    optimizedText,
    unifiedDiff: computeUnifiedDiff(baselineText, optimizedText),
    sections: {
      persona: { baseline: personaBaseline, optimized: personaOptimized },
      requirements: { baseline: reqBaseline, optimized: reqOptimized },
      fallbackOutput: { baseline: fallbackBaseline, optimized: fallbackOptimized },
      styleGuide: { baseline: styleBaseline, optimized: styleOptimized },
    },
  };
}

export async function optimizePromptWithDSPy(
  payload: DspyOptimizationPayload,
): Promise<DspyOptimizationResult> {
  const scriptPath = join(process.cwd(), "python", "dspy_optimize.py");
  const pythonBinary = process.env.PYTHON_BIN || process.env.DSPY_PYTHON || process.env.PYTHON || "python3";
  const timeoutMs = payload.timeoutMs ?? PYTHON_TIMEOUT_FALLBACK_MS;

  return new Promise<DspyOptimizationResult>((resolve, reject) => {
    const child = spawn(pythonBinary, ["-u", scriptPath], {
      env: buildPythonEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    const STDOUT_MAX = Number(process.env.DSPY_STDOUT_BUFFER_MAX ?? 524288); // 512KB default
    let stdoutBuf = "";
    let stderr = "";

    const progressUpdates: DspyProgress[] = [];

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      // Append to ring buffer (keep only the last STDOUT_MAX characters)
      stdoutBuf += text;
      if (stdoutBuf.length > STDOUT_MAX) {
        stdoutBuf = stdoutBuf.slice(-STDOUT_MAX);
      }
      // Try to parse any complete JSON lines in this chunk as progress updates
      const lines = text.split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj && obj.type === "progress") {
            progressUpdates.push({
              iteration: Number(obj.iteration) || 0,
              rawScore: typeof obj.rawScore === "number" ? obj.rawScore : undefined,
              score: typeof obj.score === "number" ? obj.score : undefined,
              coverage: typeof obj.coverage === "number" ? obj.coverage : undefined,
              satisfied: Array.isArray(obj.satisfied) ? obj.satisfied : undefined,
              missing: Array.isArray(obj.missing) ? obj.missing : undefined,
              satisfiedCount:
                typeof obj.satisfiedCount === "number" ? obj.satisfiedCount : Array.isArray(obj.satisfied) ? obj.satisfied.length : undefined,
              message: typeof obj.message === "string" ? obj.message : undefined,
              validationSize: typeof obj.validationSize === "number" ? obj.validationSize : undefined,
              validationTotal: typeof obj.validationTotal === "number" ? obj.validationTotal : undefined,
              confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
              stage: typeof obj.stage === "number" ? obj.stage : undefined,
              stages: typeof obj.stages === "number" ? obj.stages : undefined,
              bestRawScore: typeof obj.bestRawScore === "number" ? obj.bestRawScore : undefined,
              bestAdjScore: typeof obj.bestAdjScore === "number" ? obj.bestAdjScore : undefined,
              bestCoverage: typeof obj.bestCoverage === "number" ? obj.bestCoverage : undefined,
              bestIteration: typeof obj.bestIteration === "number" ? obj.bestIteration : undefined,
              bestStage: typeof obj.bestStage === "number" ? obj.bestStage : undefined,
              perfectStreak: typeof obj.perfectStreak === "number" ? obj.perfectStreak : undefined,
              earlyStop: typeof obj.earlyStop === "boolean" ? obj.earlyStop : undefined,
            });
          }
        } catch {
          // not a JSON line or partial line; ignore here and parse again on close
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const stderrMsg = stderr.trim();
        const stdoutLines = stdoutBuf.trim().split(/\r?\n/).filter((line) => line.trim());
        const stdoutTail = stdoutLines.slice(-5).join("\n"); // Last 5 lines for context

        let errorMsg = `DSPy optimizer exited with code ${code}`;
        if (stderrMsg) {
          errorMsg += `\n\nError details:\n${stderrMsg}`;
        }
        if (stdoutTail && stdoutTail !== stderrMsg) {
          errorMsg += `\n\nLast output:\n${stdoutTail}`;
        }

        reject(new Error(errorMsg));
        return;
      }

      const trimmed = stdoutBuf.trim();
      if (!trimmed) {
        reject(new Error("DSPy optimizer returned an empty response"));
        return;
      }

        // Parse stdout as a sequence of JSON lines. Progress lines have type: "progress".
        // The final result is the last JSON line without type === "progress".
        let resultObj: unknown = null;
      const lines = trimmed.split(/\r?\n/);
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj && obj.type === "progress") {
            // Ensure we captured it (in case it wasn't parsed during streaming)
            const already =
              progressUpdates.length > 0 && progressUpdates[progressUpdates.length - 1].iteration === obj.iteration;
            if (!already) {
              progressUpdates.push({
                iteration: Number(obj.iteration) || 0,
                rawScore: typeof obj.rawScore === "number" ? obj.rawScore : undefined,
                score: typeof obj.score === "number" ? obj.score : undefined,
                coverage: typeof obj.coverage === "number" ? obj.coverage : undefined,
                satisfied: Array.isArray(obj.satisfied) ? obj.satisfied : undefined,
                missing: Array.isArray(obj.missing) ? obj.missing : undefined,
                satisfiedCount:
                  typeof obj.satisfiedCount === "number"
                    ? obj.satisfiedCount
                    : Array.isArray(obj.satisfied)
                      ? obj.satisfied.length
                      : undefined,
                message: typeof obj.message === "string" ? obj.message : undefined,
                validationSize: typeof obj.validationSize === "number" ? obj.validationSize : undefined,
                validationTotal: typeof obj.validationTotal === "number" ? obj.validationTotal : undefined,
                confidence: typeof obj.confidence === "number" ? obj.confidence : undefined,
                stage: typeof obj.stage === "number" ? obj.stage : undefined,
                stages: typeof obj.stages === "number" ? obj.stages : undefined,
                bestRawScore: typeof obj.bestRawScore === "number" ? obj.bestRawScore : undefined,
                bestAdjScore: typeof obj.bestAdjScore === "number" ? obj.bestAdjScore : undefined,
                bestCoverage: typeof obj.bestCoverage === "number" ? obj.bestCoverage : undefined,
                bestIteration: typeof obj.bestIteration === "number" ? obj.bestIteration : undefined,
                bestStage: typeof obj.bestStage === "number" ? obj.bestStage : undefined,
                perfectStreak: typeof obj.perfectStreak === "number" ? obj.perfectStreak : undefined,
                earlyStop: typeof obj.earlyStop === "boolean" ? obj.earlyStop : undefined,
              });
            }
          } else {
            resultObj = obj;
          }
        } catch {
          // Ignore non-JSON garbage lines
        }
      }

      if (!resultObj) {
        // Fallback: try to parse entire stdout as one JSON (legacy behavior)
        try {
          resultObj = JSON.parse(trimmed);
        } catch (error) {
          reject(
            new Error(`Failed to parse DSPy optimizer response: ${(error as Error).message}\nOutput: ${trimmed}`),
          );
          return;
        }
      }

        const optimizedPromptObj: OptimizedPrompt | undefined =
          (resultObj as DspyOptimizationResult | null)?.optimizedPrompt;
      const comparison: DspyPromptComparison = buildPromptComparison(payload.basePrompt, optimizedPromptObj);

      const finalResult: DspyOptimizationResult = {
        ...(resultObj as DspyOptimizationResult),
        progress: progressUpdates,
        comparison,
      };

      resolve(finalResult);
    });

    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (error) {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    }
  });
}
