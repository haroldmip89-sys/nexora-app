import Link from "next/link";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PublicProjectSummary } from "@/modules/projects/types/public-project.types";

const MAX_VISIBLE_TECHNOLOGIES = 4;

export const PUBLIC_DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatBudgetRange(minCents: number, maxCents: number): string {
  return minCents === maxCents
    ? formatUsd(minCents)
    : `${formatUsd(minCents)} – ${formatUsd(maxCents)}`;
}

type Props = { project: PublicProjectSummary };

export function PublicProjectCard({ project }: Props) {
  const visible = project.technologies.slice(0, MAX_VISIBLE_TECHNOLOGIES);
  const hidden = project.technologies.length - visible.length;

  return (
    <article className="relative flex h-full flex-col gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4 transition-colors focus-within:ring-3 focus-within:ring-[#183D30]/40 hover:border-[#183D30]/40 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="max-w-full break-words rounded-full bg-[#DCE6DE] px-2.5 py-1 font-medium text-[#183D30]">
          {project.category}
        </span>
        {project.publishedAt ? (
          <time dateTime={project.publishedAt.toISOString()} className="text-[#535E56]">
            {PUBLIC_DATE_FORMATTER.format(project.publishedAt)}
          </time>
        ) : null}
      </div>

      <h2 className="min-w-0 break-words text-base font-semibold text-[#202522]">
        <Link
          href={`/projects/${project.id}`}
          className={cn(
            "rounded-sm outline-none after:absolute after:inset-0 after:rounded-[14px]",
            "focus-visible:underline",
          )}
        >
          {project.title}
        </Link>
      </h2>

      <p className="line-clamp-3 break-words text-sm text-[#535E56]">{project.summary}</p>

      {visible.length > 0 ? (
        <ul aria-label="Tecnologías" className="flex flex-wrap gap-1.5">
          {visible.map((tech) => (
            <li
              key={tech}
              className="max-w-full break-words rounded-full border border-[#E3E8E3] px-2 py-0.5 text-xs text-[#202522]"
            >
              {tech}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="rounded-full px-2 py-0.5 text-xs text-[#535E56]">+{hidden}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-[#E3E8E3] pt-3">
        <dl className="flex flex-col gap-0.5 text-sm">
          <div className="flex gap-1.5">
            <dt className="sr-only">Presupuesto</dt>
            <dd className="font-medium text-[#202522]">
              {formatBudgetRange(project.budgetMinCents, project.budgetMaxCents)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">Plazo</dt>
            <dd className="text-[#535E56]">{project.timelineWeeks} semanas</dd>
          </div>
        </dl>
        <span aria-hidden="true" className="text-sm font-medium text-[#183D30]">
          Ver detalles →
        </span>
      </div>
    </article>
  );
}
