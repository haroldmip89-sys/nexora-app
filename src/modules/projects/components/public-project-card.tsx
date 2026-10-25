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

const DT = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
const DD = "text-sm font-extrabold text-foreground";

type Props = { project: PublicProjectSummary; actions?: React.ReactNode };

export function PublicProjectCard({ project, actions }: Props) {
  const visible = project.technologies.slice(0, MAX_VISIBLE_TECHNOLOGIES);
  const hidden = project.technologies.length - visible.length;

  return (
    <article className="surface relative flex h-full w-full flex-col gap-3.5 p-5 transition-colors focus-within:ring-3 focus-within:ring-ring/40 hover:border-primary/40 sm:p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="max-w-full break-words text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {project.category}
        </span>
        {project.publishedAt ? (
          <time dateTime={project.publishedAt.toISOString()} className="text-xs text-muted-foreground">
            {PUBLIC_DATE_FORMATTER.format(project.publishedAt)}
          </time>
        ) : null}
      </div>

      <h2 className="min-w-0 break-words text-lg font-extrabold leading-snug text-foreground">
        <Link
          href={`/projects/${project.id}`}
          className={cn(
            "rounded-sm outline-none after:absolute after:inset-0 after:rounded-[inherit]",
            "focus-visible:underline",
          )}
        >
          {project.title}
        </Link>
      </h2>

      <p className="line-clamp-3 break-words text-sm leading-relaxed text-text-body">
        {project.summary}
      </p>

      {visible.length > 0 ? (
        <ul aria-label="Tecnologías" className="flex flex-wrap gap-1.5">
          {visible.map((tech) => (
            <li
              key={tech}
              className="max-w-full break-words rounded-full border border-chip-border bg-chip px-2.5 py-1 text-xs font-bold text-primary"
            >
              {tech}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="rounded-full px-2 py-1 text-xs font-bold text-muted-foreground">
              +{hidden}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 border-t border-divider pt-3.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <dl className="flex gap-[18px]">
            <div className="flex flex-col gap-0.5">
              <dt className={DT}>Presupuesto</dt>
              <dd className={DD}>
                {formatBudgetRange(project.budgetMinCents, project.budgetMaxCents)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className={DT}>Plazo</dt>
              <dd className={DD}>{project.timelineWeeks} semanas</dd>
            </div>
          </dl>
          {actions ? null : (
            <span aria-hidden="true" className="text-sm font-bold text-primary">
              Ver detalle →
            </span>
          )}
        </div>
        {actions ? <div className="relative z-10">{actions}</div> : null}
      </div>
    </article>
  );
}
