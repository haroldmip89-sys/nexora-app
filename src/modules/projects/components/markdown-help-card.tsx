const SYNTAX: { syntax: string; effect: string }[] = [
  { syntax: "## Título", effect: "Sección" },
  { syntax: "**texto**", effect: "Negrita" },
  { syntax: "*texto*", effect: "Cursiva" },
  { syntax: "- item", effect: "Lista" },
  { syntax: "- [ ] tarea", effect: "Lista de tareas" },
  { syntax: "[texto](url)", effect: "Enlace" },
  { syntax: "`código`", effect: "Código" },
  { syntax: "> nota", effect: "Cita" },
  { syntax: "| A | B |", effect: "Tabla" },
];

/** Static quick reference for the Markdown editor. */
export function MarkdownHelpCard() {
  return (
    <aside aria-labelledby="md-help" className="surface min-w-0 p-5">
      <h2 id="md-help" className="mb-3 text-base font-semibold text-foreground">
        Guía rápida de Markdown
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-[13px]">
        {SYNTAX.map(({ syntax, effect }) => (
          <div key={syntax} className="contents">
            <dt className="rounded-md bg-muted px-1.5 py-0.5 font-mono break-all">{syntax}</dt>
            <dd className="m-0 text-foreground">{effect}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-[10px] bg-background p-3 text-[13px] leading-normal text-foreground">
        No se pueden subir archivos ni imágenes aquí. El HTML se ignora por seguridad.
      </p>
    </aside>
  );
}
