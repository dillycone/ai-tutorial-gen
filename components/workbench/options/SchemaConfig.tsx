"use client";

import { useMemo, useState } from "react";
import type { SchemaTemplate, SchemaTemplateInput, SchemaType } from "@/lib/types";
import CreateSchemaTemplateDialog from "@/components/workbench/options/CreateSchemaTemplateDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, Users, Info, Sparkles, Plus, Loader2 } from "lucide-react";

const templateIcon = (template: SchemaTemplate) => {
  if (template.id === "tutorial") {
    return <BookOpen className="h-4 w-4 text-blue-400" />;
  }
  if (template.id === "meetingSummary") {
    return <Users className="h-4 w-4 text-green-400" />;
  }
  return <Sparkles className="h-4 w-4 text-amber-400" />;
};

type SchemaConfigProps = {
  schemaType: SchemaType;
  setSchemaType: (value: SchemaType) => void;
  enforceSchema: boolean;
  setEnforceSchema: (value: boolean) => void;
  templates: SchemaTemplate[];
  loading: boolean;
  error: string | null;
  onCreateTemplate: (input: SchemaTemplateInput) => Promise<SchemaTemplate>;
};

export default function SchemaConfig({
  schemaType,
  setSchemaType,
  enforceSchema,
  setEnforceSchema,
  templates,
  loading,
  error,
  onCreateTemplate,
}: SchemaConfigProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const selectedTemplate = useMemo(() => templates.find((tpl) => tpl.id === schemaType) ?? null, [templates, schemaType]);
  const hasTemplates = templates.length > 0;
  const selectValue = selectedTemplate ? selectedTemplate.id : undefined;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="schema-select" className="text-sm font-medium text-gray-700">
              Schema template
            </Label>
            <div className="flex items-center gap-2">
              {loading ? <Loader2 className="h-3 w-3 animate-spin text-sky-500" /> : null}
              <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} className="text-xs">
                <Plus className="h-3 w-3" /> New template
              </Button>
            </div>
          </div>

          <Select
            value={selectValue}
            onValueChange={(value) => setSchemaType(value as SchemaType)}
            disabled={loading || !hasTemplates}
          >
            <SelectTrigger
              id="schema-select"
              className="bg-white border-gray-300 text-gray-900 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50"
            >
              <SelectValue placeholder={loading ? "Loading templates…" : "Select a template"} />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200 max-h-80">
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id} className="text-gray-900 hover:bg-gray-100">
                  <div className="flex flex-col gap-1 py-1">
                    <div className="flex items-center gap-2">
                      {templateIcon(template)}
                      <span className="text-sm font-medium text-gray-900">{template.name}</span>
                      {!template.builtIn ? (
                        <Badge variant="outline" className="border-sky-300 text-sky-600 text-[10px]">
                          Custom
                        </Badge>
                      ) : null}
                    </div>
                    {template.description ? (
                      <span className="text-xs text-gray-500 line-clamp-2">{template.description}</span>
                    ) : null}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!loading && !hasTemplates ? (
            <p className="text-xs text-gray-500">No templates available yet — create a template to get started.</p>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {selectedTemplate ? (
            <div className="rounded-md border border-gray-200 bg-white/60 p-3">
              <div className="flex items-center gap-2">
                {templateIcon(selectedTemplate)}
                <span className="text-sm font-semibold text-gray-900">{selectedTemplate.name}</span>
                {!selectedTemplate.builtIn ? (
                  <Badge variant="outline" className="border-sky-300 text-sky-600 text-[10px]">
                    Custom
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-gray-600">
                {selectedTemplate.description || "No description provided."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
                  Hint label: {selectedTemplate.hintLabel || "—"}
                </span>
                <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
                  {selectedTemplate.styleGuide ? "Style guide provided" : "Default tone"}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center space-x-3 mt-2 md:mt-8">
          <Checkbox
            id="enforce-schema"
            checked={enforceSchema}
            onCheckedChange={(checked) => setEnforceSchema(checked as boolean)}
            className="border-gray-300 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="enforce-schema" className="text-sm text-gray-700 font-medium">
                Enforce JSON schema
              </Label>
              <Badge variant="secondary" className="bg-sky-500/20 text-sky-300 text-xs">
                Recommended
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-500 hover:text-gray-700 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Ensures consistent output format and structure</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs text-gray-500">
              When enabled, Gemini must return JSON matching the selected schema definition.
            </p>
          </div>
        </div>
      </div>

      <CreateSchemaTemplateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={onCreateTemplate}
      />
    </>
  );
}