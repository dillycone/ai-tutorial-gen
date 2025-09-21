"use client";

import { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type GenericSchemaEditorProps = {
  data: Record<string, unknown> | null;
  schema?: unknown;
  onChange: (updater: (draft: Record<string, unknown>) => void) => void;
};

type EditableField = {
  key: string;
  type: "string" | "string[]";
  value: string | string[];
};

const extractEditableFields = (data: Record<string, unknown> | null): EditableField[] => {
  if (!data) return [];

  return Object.entries(data)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return { key, type: "string" as const, value };
      }
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        return { key, type: "string[]" as const, value: value as string[] };
      }
      return null;
    })
    .filter((item): item is EditableField => Boolean(item));
};

export default function GenericSchemaEditor({ data, schema, onChange }: GenericSchemaEditorProps) {
  const editableFields = useMemo(() => extractEditableFields(data), [data]);
  const schemaHint = schema && typeof schema === "object" ? Object.keys(schema as Record<string, unknown>).length : 0;

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No structured data yet. Generate a result or switch to the JSON tab to paste a payload.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-800">Quick edits</h3>
          <p className="text-xs text-gray-500">
            Update simple string fields here. For nested objects or custom structures, use the JSON tab.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {editableFields.length === 0 ? (
            <Alert>
              <AlertDescription>
                None of the top-level fields are simple strings or string lists. Use the JSON tab for detailed editing.
              </AlertDescription>
            </Alert>
          ) : null}

          {editableFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`generic-field-${field.key}`} className="text-sm font-medium text-gray-700">
                {field.key}
              </Label>
              {field.type === "string" ? (
                <Input
                  id={`generic-field-${field.key}`}
                  value={field.value as string}
                  onChange={(event) =>
                    onChange((draft) => {
                      draft[field.key] = event.target.value;
                    })
                  }
                  className="bg-white"
                />
              ) : (
                <Textarea
                  id={`generic-field-${field.key}`}
                  value={(field.value as string[]).join("\n")}
                  onChange={(event) => {
                    const lines = event.target.value
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean);
                    onChange((draft) => {
                      draft[field.key] = lines;
                    });
                  }}
                  placeholder="One value per line"
                  rows={4}
                  className="bg-white"
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>
          {schemaHint
            ? `The linked schema exposes ${schemaHint} top-level properties. Complex structures aren’t editable here yet—switch to the JSON tab for full control.`
            : "Switch to the JSON tab to edit complex or nested fields."}
        </AlertDescription>
      </Alert>
    </div>
  );
}
