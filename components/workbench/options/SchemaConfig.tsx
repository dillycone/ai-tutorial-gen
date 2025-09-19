// components/workbench/options/SchemaConfig.tsx
"use client";

import { SchemaType } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BookOpen, Users, Info } from "lucide-react";

type SchemaConfigProps = {
  schemaType: SchemaType;
  setSchemaType: (value: SchemaType) => void;
  enforceSchema: boolean;
  setEnforceSchema: (value: boolean) => void;
};

export default function SchemaConfig({
  schemaType,
  setSchemaType,
  enforceSchema,
  setEnforceSchema,
}: SchemaConfigProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="schema-select" className="text-sm font-medium text-gray-700">
          Schema Type
        </Label>
        <Select value={schemaType} onValueChange={(value) => setSchemaType(value as SchemaType)}>
          <SelectTrigger
            id="schema-select"
            className="bg-white border-gray-300 text-gray-900 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-gray-200">
            <SelectItem value="tutorial" className="text-gray-900 hover:bg-gray-100">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-blue-400" />
                Tutorial
              </div>
            </SelectItem>
            <SelectItem value="meetingSummary" className="text-gray-900 hover:bg-gray-100">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-green-400" />
                Meeting Summary
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-3 mt-8">
        <Checkbox
          id="enforce-schema"
          checked={enforceSchema}
          onCheckedChange={(checked) => setEnforceSchema(checked as boolean)}
          className="border-gray-300 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="enforce-schema" className="text-sm text-gray-700 font-medium">
            Enforce JSON schema
          </Label>
          <Badge variant="secondary" className="bg-sky-500/20 text-sky-300 text-xs">
            Recommended
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-4 text-gray-500 hover:text-gray-700 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Ensures consistent output format and structure</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}