import Link from "next/link";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { cn } from "@/lib/utils";
import {
  PUBLIC_DATE_FORMATTER,
  formatBudgetRange,
} from "@/modules/projects/components/public-project-card";
import { ProposalCta } from "@/modules/projects/components/proposal-cta";
import type { PublicProject, PublicViewer } from "@/modules/projects/types/public-project.types";
import { DeveloperProposalSection } from "@/modules/proposals/components/developer-proposal-section";

type Props = { project: PublicProject; viewer: PublicViewer };

const DT = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const PILL = "max-w-full break-words rounded-full px-2.5 py-1 text-xs font-bold";

/** Public project detail. Renders content only: the page provides `<main>`. */
export function PublicProjectDetail({ project, viewer }: Props) {
  const isDeveloper = viewer.kind === "user" && viewer.role === "developer";

  return (
    <article className="flex flex-col gap-6">
      <Link
        href="/projects"
        className={cn(
          "inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-bold text-primary underline",
          "outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        )}
      >
        ← Volver a proyectos
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cn(PILL, "border border-chip-border bg-chip text-primary")}>
            {project.category}
          </span>
          <span className={cn(PILL, "bg-success-bg text-success-fg")}>Publicado</span>
          {project.publishedAt ? (
            <time
              dateTime={project.publishedAt.toISOString()}
              className="text-xs text-muted-foreground"
            >
              Publicado el {PUBLIC_DATE_FORMATTER.format(project.publishedAt)}
            </time>
          ) : null}
        </div>
        <h1 className="break-words text-[32px] font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
          {project.title}
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <aside
          aria-labelledby="project-details"
          className="surface flex flex-col gap-5 p-5 lg:order-2"
        >
          <h2 id="project-details" className="text-lg font-semibold text-foreground">
            Detalles
          </h2>
          <dl className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className={DT}>Presupuesto</dt>
              <dd className="text-lg font-semibold text-foreground">
                {formatBudgetRange(project.budgetMinCents, project.budgetMaxCents)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className={DT}>Plazo</dt>
              <dd className="text-foreground">{project.timelineWeeks} semanas</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className={DT}>Categoría</dt>
              <dd className="break-words text-foreground">{project.category}</dd>
            </div>
            {project.technologies.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <dt className={DT}>Tecnologías</dt>
                <dd>
                  <ul className="flex flex-wrap gap-1.5">
                    {project.technologies.map((tech) => (
                      <li
                        key={tech}
                        className={cn(PILL, "border border-chip-border bg-chip text-primary")}
                      >
                        {tech}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="border-t border-divider pt-4">
            <ProposalCta projectId={project.id} viewer={viewer} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <section aria-labelledby="project-description" className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-5 py-3 sm:px-8">
              <h2 id="project-description" className="text-base font-semibold text-foreground">
                Descripción
              </h2>
              <span className="font-mono text-xs text-muted-foreground">Markdown</span>
            </div>
            <MarkdownContent
              source={project.description}
              className="px-6 py-6 sm:px-8 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            />
          </section>

          {isDeveloper ? <DeveloperProposalSection projectId={project.id} /> : null}
        </div>
      </div>
    </article>
  );
}
