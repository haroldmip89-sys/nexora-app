import { useId } from "react";
import { cn } from "@/lib/utils";

export type TagOption = { value: string; label: string };

export type TagPickerProps = {
  name: string;
  legend: string;
  options: TagOption[];
  defaultSelected?: string[];
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

// Same tokens as the dashboard Chip (project-list.tsx), driven by the native checkbox state.
const TILE =
  "inline-flex h-8 cursor-pointer items-center rounded-full border border-[#E3E8E3] bg-white px-3 text-sm text-[#535E56] transition-colors hover:border-[#183D30]/50 peer-checked:border-[#183D30] peer-checked:bg-[#183D30] peer-checked:font-medium peer-checked:text-white peer-focus-visible:ring-3 peer-focus-visible:ring-[#183D30]/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-60";

/** Multi-select of tiles backed by native checkboxes (no client state, works without JS). */
export function TagPicker({
  name,
  legend,
  options,
  defaultSelected = [],
  disabled,
  hint,
  error,
  className,
}: TagPickerProps) {
  const uid = useId();
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const selected = new Set(defaultSelected);

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <legend className="mb-1.5 text-sm font-medium text-[#202522]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.has(option.value)}
              className="peer sr-only"
            />
            <span className={TILE}>{option.label}</span>
          </label>
        ))}
      </div>
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
    </fieldset>
  );
}
