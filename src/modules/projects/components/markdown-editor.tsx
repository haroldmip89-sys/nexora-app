"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Bold,
  Code,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  Table,
} from "lucide-react";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { applyMarkdownFormat, type MarkdownFormat } from "@/lib/markdown-format";

type Props = {
  id: string;
  name: string;
  defaultValue: string;
  maxLength: number;
  minLength?: number;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

type Tab = "write" | "preview";

const TOOLBAR: {
  format: MarkdownFormat;
  label: string;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { format: "heading", label: "Título", Icon: Heading },
  { format: "bold", label: "Negrita", Icon: Bold },
  { format: "italic", label: "Cursiva", Icon: Italic },
  { format: "list", label: "Lista", Icon: List },
  { format: "task-list", label: "Lista de tareas", Icon: ListChecks },
  { format: "link", label: "Enlace", Icon: LinkIcon },
  { format: "code", label: "Código", Icon: Code },
  { format: "table", label: "Tabla", Icon: Table },
];

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const TAB_BASE = `inline-flex min-h-10 items-center justify-center rounded-lg border px-3.5 text-sm ${FOCUS}`;

export function MarkdownEditor({
  id,
  name,
  defaultValue,
  maxLength,
  minLength,
  readOnly,
  invalid,
  describedBy,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [tab, setTab] = useState<Tab>("write");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore focus and selection after a toolbar edit re-renders the controlled textarea.
  useEffect(() => {
    if (!selection || !textareaRef.current) return;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(selection.start, selection.end);
  }, [selection]);

  function format(kind: MarkdownFormat) {
    const el = textareaRef.current;
    if (!el || readOnly) return;
    const edit = applyMarkdownFormat(kind, el.value, el.selectionStart, el.selectionEnd);
    setValue(edit.value);
    setSelection({ start: edit.selectionStart, end: edit.selectionEnd });
  }

  const writing = tab === "write";
  const tabClass = (active: boolean) =>
    cn(
      TAB_BASE,
      active
        ? "border-border bg-card font-semibold text-foreground"
        : "border-transparent font-medium text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs text-muted-foreground">Markdown · sin archivos ni imágenes</span>

      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-card focus-within:ring-3 focus-within:ring-ring/40",
          invalid ? "border-destructive" : "border-input",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle px-2 py-1.5">
          <div className="flex gap-1" role="group" aria-label="Modo del editor">
            <button
              type="button"
              aria-pressed={writing}
              onClick={() => setTab("write")}
              className={tabClass(writing)}
            >
              Escribir
            </button>
            <button
              type="button"
              aria-pressed={!writing}
              onClick={() => setTab("preview")}
              className={tabClass(!writing)}
            >
              Vista previa
            </button>
          </div>

          {writing ? (
            <div className="flex flex-wrap gap-0.5" role="toolbar" aria-label="Formato de Markdown">
              {TOOLBAR.map(({ format: kind, label, Icon }) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={label}
                  title={label}
                  disabled={readOnly}
                  onClick={() => format(kind)}
                  className={cn(
                    "inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                    FOCUS,
                  )}
                >
                  <Icon aria-hidden className="size-[18px]" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Always mounted so FormData keeps the value while previewing. */}
        <Textarea
          ref={textareaRef}
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInvalid={() => setTab("write")}
          required
          minLength={minLength}
          maxLength={maxLength}
          rows={14}
          readOnly={readOnly}
          hidden={!writing}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "block rounded-none border-0 bg-card p-4 font-mono text-sm leading-[1.7] text-foreground focus-visible:ring-0",
            !writing && "hidden",
          )}
        />

        {writing ? null : (
          <div
            className="min-h-40 px-5 py-4"
            aria-label="Vista previa de la descripción"
            role="region"
          >
            {value.trim() ? (
              <MarkdownContent source={value} />
            ) : (
              <p className="text-sm text-muted-foreground">Nada que previsualizar</p>
            )}
          </div>
        )}
      </div>

      <p className="text-right text-xs text-muted-foreground">
        {value.length} / {maxLength} caracteres
      </p>
    </div>
  );
}
