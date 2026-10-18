import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PUBLIC_DATE_FORMATTER,
  formatBudgetRange,
} from "@/modules/projects/components/public-project-card";
import { ProposalCta } from "@/modules/projects/components/proposal-cta";
import type { PublicProject, PublicViewer } from "@/modules/projects/types/public-project.types";

type Props = { project: PublicProject; viewer: PublicViewer };

/** Public project detail. Renders content only: the page provides `<main>`. */
export function PublicProjectDetail({ project, viewer }: Props) {
  return (
    <article className="flex flex-col gap-6">
      <Link
        href="/projects"
        className={cn(
          "inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-medium text-[#183D30] underline",
          "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40",
        )}
      >
        ← Volver a proyectos
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="max-w-full break-words rounded-full bg-[#DCE6DE] px-2.5 py-1 font-medium text-[#183D30]">
            {project.category}
          </span>
          {project.publishedAt ? (
            <time dateTime={project.publishedAt.toISOString()} className="text-[#535E56]">
              Publicado el {PUBLIC_DATE_FORMATTER.format(project.publishedAt)}
            </time>
          ) : null}
        </div>
        <h1 className="break-words text-2xl font-semibold tracking-tight text-[#202522] sm:text-3xl">
          {project.title}
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <aside
          aria-label="Resumen del proyecto"
          className="flex flex-col gap-5 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5 lg:order-2"
        >
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs text-[#535E56]">Presupuesto</dt>
              <dd className="text-lg font-semibold text-[#202522]">
                {formatBudgetRange(project.budgetMinCents, project.budgetMaxCents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#535E56]">Plazo</dt>
              <dd className="text-[#202522]">{project.timelineWeeks} semanas</dd>
            </div>
            <div>
              <dt className="text-xs text-[#535E56]">Categoría</dt>
              <dd className="break-words text-[#202522]">{project.category}</dd>
            </div>
          </dl>
          <div className="border-t border-[#E3E8E3] pt-4">
            <ProposalCta projectId={project.id} viewer={viewer} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <section aria-labelledby="project-description">
            <h2 id="project-description" className="text-lg font-semibold text-[#202522]">
              Descripción
            </h2>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-[#202522]">
              {project.description}
            </p>
          </section>

          {project.technologies.length > 0 ? (
            <section aria-labelledby="project-technologies">
              <h2 id="project-technologies" className="text-lg font-semibold text-[#202522]">
                Tecnologías
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {project.technologies.map((tech) => (
                  <li
                    key={tech}
                    className="max-w-full break-words rounded-full bg-[#DCE6DE] px-3 py-1 text-sm text-[#183D30]"
                  >
                    {tech}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
