"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import type { SchemaTemplate, SchemaTemplateInput } from "@/lib/types";

const ID_PATTERN = /^[a-z][a-z0-9-]{2,48}$/;
const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {},
  "required": []
}`;

type CreateSchemaTemplateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: SchemaTemplateInput) => Promise<SchemaTemplate>;
};

function slugifyId(source: string): string {
  const base = source.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const trimmed = base.slice(0, 48) || "schema-template";
  return /^[a-z]/.test(trimmed) ? trimmed : `schema-${trimmed}`;
}

export default function CreateSchemaTemplateDialog({ open, onOpenChange, onCreate }: CreateSchemaTemplateDialogProps) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("schema-template");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");
  const [requirements, setRequirements] = useState("");
  const [fallbackOutput, setFallbackOutput] = useState("");
  const [hintLabel, setHintLabel] = useState("title");
  const [styleGuide, setStyleGuide] = useState("");
  const [schemaJson, setSchemaJson] = useState(DEFAULT_SCHEMA);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setTemplateId("schema-template");
    setIdEdited(false);
    setDescription("");
    setPersona("");
    setRequirements("");
    setFallbackOutput("");
    setHintLabel("title");
    setStyleGuide("");
    setSchemaJson(DEFAULT_SCHEMA);
    setError(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!idEdited) {
      const nextId = slugifyId(name);
      setTemplateId(nextId);
    }
  }, [name, idEdited]);

  const handleIdChange = useCallback((value: string) => {
    setTemplateId(value);
    setIdEdited(true);
  }, []);

  const parsedSchemaPreview = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(schemaJson), null, 2);
    } catch {
      return schemaJson;
    }
  }, [schemaJson]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const trimmedName = name.trim();
      const trimmedId = templateId.trim();
      const trimmedPersona = persona.trim();
      const trimmedRequirements = requirements.trim();
      const trimmedFallback = fallbackOutput.trim();
      const trimmedHint = hintLabel.trim() || "title";
      const trimmedStyle = styleGuide.trim();
      const trimmedDescription = description.trim();

      if (!trimmedName) {
        setError("Template name is required.");
        return;
      }
      if (!ID_PATTERN.test(trimmedId)) {
        setError("Template id must be 3-49 chars, start with a letter, and use lowercase letters, numbers, or hyphens.");
        return;
      }
      if (!trimmedPersona) {
        setError("Persona instructions are required.");
        return;
      }
      if (!trimmedRequirements) {
        setError("Requirements are required.");
        return;
      }
      if (!trimmedFallback) {
        setError("Fallback output guidance is required.");
        return;
      }

      let schemaObject: unknown;
      try {
        schemaObject = JSON.parse(schemaJson);
      } catch (schemaError) {
        setError(schemaError instanceof Error ? schemaError.message : "Schema must be valid JSON.");
        return;
      }

      const payload: SchemaTemplateInput = {
        id: trimmedId,
        name: trimmedName,
        description: trimmedDescription || undefined,
        persona: trimmedPersona,
        requirements: trimmedRequirements,
        fallbackOutput: trimmedFallback,
        hintLabel: trimmedHint,
        schema: schemaObject,
        styleGuide: trimmedStyle || undefined,
      };

      setSubmitting(true);
      setError(null);
      try {
        await onCreate(payload);
        onOpenChange(false);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Failed to create schema template.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      name,
      templateId,
      persona,
      requirements,
      fallbackOutput,
      hintLabel,
      styleGuide,
      description,
      schemaJson,
      submitting,
      onCreate,
      onOpenChange,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create schema template</DialogTitle>
          <DialogDescription>
            Define persona guidance, requirements, and the JSON schema Gemini should enforce. Templates you
            create here will be available alongside the built-in presets.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template name</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Compliance checklist"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-id">Template id</Label>
              <Input
                id="template-id"
                value={templateId}
                onChange={(event) => handleIdChange(event.target.value)}
                placeholder="compliance-checklist"
                required
              />
              <p className="text-xs text-gray-500">
                Lowercase, 3-49 characters. Letters, numbers, and hyphens only.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Input
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Used for onboarding readiness assessments"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-persona">Persona</Label>
            <Textarea
              id="template-persona"
              value={persona}
              onChange={(event) => setPersona(event.target.value)}
              placeholder="You are an expert compliance auditor..."
              className="min-h-[96px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-requirements">Requirements</Label>
            <Textarea
              id="template-requirements"
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              placeholder="- Review the video and screenshots..."
              className="min-h-[140px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-fallback">Fallback output instructions</Label>
            <Textarea
              id="template-fallback"
              value={fallbackOutput}
              onChange={(event) => setFallbackOutput(event.target.value)}
              placeholder="If structured output fails, provide a markdown summary..."
              className="min-h-[96px]"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-hint">Hint label</Label>
              <Input
                id="template-hint"
                value={hintLabel}
                onChange={(event) => setHintLabel(event.target.value)}
                placeholder="title"
              />
              <p className="text-xs text-gray-500">Used for the optional hint input (e.g., &quot;title&quot;, &quot;meeting name&quot;).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-style">Style guide (optional)</Label>
              <Textarea
                id="template-style"
                value={styleGuide}
                onChange={(event) => setStyleGuide(event.target.value)}
                placeholder="Maintain a concise, executive-ready tone..."
                className="min-h-[96px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-schema">JSON schema</Label>
            <Textarea
              id="template-schema"
              value={schemaJson}
              onChange={(event) => setSchemaJson(event.target.value)}
              className="font-mono text-xs min-h-[240px]"
              required
            />
            <p className="text-xs text-gray-500">
              Schema should use the Gemini &ldquo;Type&rdquo; JSON shape (same as Google GenAI schema types).
            </p>
            <Textarea
              value={parsedSchemaPreview}
              readOnly
              className="font-mono text-[11px] min-h-[160px] bg-gray-950 text-gray-100"
            />
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Create template"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
