"use client";

import { useEffect, useRef, useState } from "react";
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

const TOOLBAR: { format: MarkdownFormat; label: string; text: string }[] = [
  { format: "heading", label: "Título", text: "H" },
  { format: "bold", label: "Negrita", text: "B" },
  { format: "italic", label: "Cursiva", text: "I" },
  { format: "list", label: "Lista", text: "•" },
  { format: "task-list", label: "Lista de tareas", text: "☑" },
  { format: "link", label: "Enlace", text: "🔗" },
  { format: "code", label: "Código", text: "</>" },
  { format: "table", label: "Tabla", text: "▦" },
];

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const TAB_BASE = `inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium ${FOCUS}`;

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

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Modo del editor">
          <button
            type="button"
            aria-pressed={writing}
            onClick={() => setTab("write")}
            className={cn(
              TAB_BASE,
              writing ? "bg-[#DCE6DE] text-[#183D30]" : "text-[#535E56] hover:bg-[#F0F2EC]",
            )}
          >
            Escribir
          </button>
          <button
            type="button"
            aria-pressed={!writing}
            onClick={() => setTab("preview")}
            className={cn(
              TAB_BASE,
              !writing ? "bg-[#DCE6DE] text-[#183D30]" : "text-[#535E56] hover:bg-[#F0F2EC]",
            )}
          >
            Vista previa
          </button>
        </div>
        <span className="text-xs text-[#535E56]">Markdown · sin archivos ni imágenes</span>
      </div>

      {writing ? (
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formato de Markdown">
          {TOOLBAR.map(({ format: kind, label, text }) => (
            <button
              key={kind}
              type="button"
              aria-label={label}
              title={label}
              disabled={readOnly}
              onClick={() => format(kind)}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-[#E3E8E3] bg-white text-sm text-[#183D30] hover:bg-[#F0F2EC] disabled:cursor-not-allowed disabled:opacity-50",
                FOCUS,
              )}
            >
              <span aria-hidden="true">{text}</span>
            </button>
          ))}
        </div>
      ) : null}

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
        rows={10}
        readOnly={readOnly}
        hidden={!writing}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          "rounded-[10px] border-[#E3E8E3] bg-white font-mono text-[#202522]",
          !writing && "hidden",
        )}
      />

      {writing ? null : (
        <div
          className="min-h-40 rounded-[10px] border border-[#E3E8E3] bg-white p-4"
          aria-label="Vista previa de la descripción"
          role="region"
        >
          {value.trim() ? (
            <MarkdownContent source={value} />
          ) : (
            <p className="text-sm text-[#535E56]">Nada que previsualizar</p>
          )}
        </div>
      )}

      <p className="text-xs text-[#535E56]">
        {value.length} / {maxLength} caracteres
      </p>

      <details className="rounded-[10px] border border-[#E3E8E3] bg-[#F0F2EC] p-3 text-sm text-[#202522]">
        <summary
          className={cn("flex min-h-11 cursor-pointer items-center rounded-md font-medium", FOCUS)}
        >
          Guía rápida de Markdown
        </summary>
        <ul className="mt-2 space-y-1 text-[#535E56]">
          <li><code># Título</code>, <code>## Subtítulo</code></li>
          <li><code>**negrita**</code>, <code>*cursiva*</code>, <code>`código`</code></li>
          <li><code>- elemento</code> o <code>1. elemento</code> para listas</li>
          <li><code>- [ ] tarea</code> para listas de tareas</li>
          <li><code>[texto](https://ejemplo.com)</code> para enlaces</li>
          <li><code>| A | B |</code> para tablas</li>
        </ul>
        <p className="mt-2 text-[#535E56]">
          No se pueden subir archivos ni imágenes aquí. El HTML se ignora por seguridad. Si
          necesitas compartir documentos, pídelos en las propuestas.
        </p>
      </details>
    </div>
  );
}
