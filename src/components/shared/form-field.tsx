"use client";

import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";

export type FormFieldProps = {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: (a11y: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
};

/** Label + control (render prop) + hint + error, wired with aria-describedby. */
export function FormField({ name, label, hint, error, children }: FormFieldProps) {
  const uid = useId();
  const id = `${uid}-${name}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-[#202522]">
        {label}
      </Label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-[#535E56]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
