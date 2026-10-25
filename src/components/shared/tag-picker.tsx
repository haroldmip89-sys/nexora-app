import { useId } from "react";
import { cn } from "@/lib/utils";

export type TagOption = { value: string; label: string };

export type TagPickerProps = {
  name: string;
  legend: string;
  /** Keep the legend for assistive tech only (when a visible label already names the group). */
  hideLegend?: boolean;
  options: TagOption[];
  defaultSelected?: string[];
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

// Same tokens as the dashboard Chip (project-list.tsx), driven by the native checkbox state.
const TILE =
  "inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 peer-checked:border-primary peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40 peer-disabled:cursor-not-allowed peer-disabled:opacity-60";

/** Multi-select of tiles backed by native checkboxes (no client state, works without JS). */
export function TagPicker({
  name,
  legend,
  hideLegend,
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
      <legend className={cn("mb-1.5 text-sm font-medium text-foreground", hideLegend && "sr-only")}>{legend}</legend>
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
        <p id={hintId} className="text-xs text-muted-foreground">
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
