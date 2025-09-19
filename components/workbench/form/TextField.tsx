// components/workbench/form/TextField.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: TextFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-500 hover:bg-gray-50 focus:border-sky-500 focus:ring-sky-500/50"
      />
    </div>
  );
}