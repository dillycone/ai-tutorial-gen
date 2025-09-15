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
};

export type OptimizedPrompt = {
  persona?: string | null;
  requirements?: string | null;
  fallbackOutput?: string | null;
  styleGuide?: string | null;
  raw?: string;
};

export type DspyOptimizationResult = {
  optimizedPrompt?: OptimizedPrompt;
  analysis?: DspyAnalysis;
  baselinePrompt?: PromptBlueprint;
};

export type DspyOptimizationPayload = {
  schemaType: SchemaType;
  enforceSchema: boolean;
  titleHint?: string;
  shots: PromptShotSummary[];
  basePrompt: PromptBlueprint;
  referencePrompts: Record<SchemaType, PromptBlueprint>;
  model?: string;
  reflectionModel?: string;
  temperature?: number;
  reflectionTemperature?: number;
  maxTokens?: number;
  reflectionMaxTokens?: number;
  auto?: "light" | "medium" | "heavy" | null;
  maxMetricCalls?: number | null;
  seed?: number;
  initialInstructions?: string;
  timeoutMs?: number;
  debug?: boolean;
};

const PYTHON_TIMEOUT_FALLBACK_MS = 90_000;

function buildPythonEnv(): NodeJS.ProcessEnv {
  const projectRoot = process.cwd();
  const pythonPathEntries = [join(projectRoot, ".python_lib")];
  const existing = process.env.PYTHONPATH;
  if (existing) pythonPathEntries.push(existing);
  const separator = process.platform === "win32" ? ";" : ":";

  return {
    ...process.env,
    PYTHONPATH: pythonPathEntries.join(separator),
  };
}

export async function optimizePromptWithDSPy(
  payload: DspyOptimizationPayload,
): Promise<DspyOptimizationResult> {
  const scriptPath = join(process.cwd(), "python", "dspy_optimize.py");
  const pythonBinary = process.env.DSPY_PYTHON || process.env.PYTHON || "python3";
  const timeoutMs = payload.timeoutMs ?? Number(process.env.DSPY_TIMEOUT_MS ?? PYTHON_TIMEOUT_FALLBACK_MS);

  return new Promise<DspyOptimizationResult>((resolve, reject) => {
    const child = spawn(pythonBinary, [scriptPath], {
      env: buildPythonEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
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
        reject(new Error(stderr.trim() || `DSPy optimizer exited with code ${code}`));
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error("DSPy optimizer returned an empty response"));
        return;
      }

      try {
        const parsed = JSON.parse(trimmed) as DspyOptimizationResult;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to parse DSPy optimizer response: ${(error as Error).message}\nOutput: ${trimmed}`));
      }
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
