import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ClientDashboard } from "@/modules/dashboard/types/dashboard.types";
import { PROJECT_LIST_STATUSES } from "@/modules/projects/schemas/project.schema";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/modules/projects/types/project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const STATUSES = PROJECT_LIST_STATUSES.filter(
  (status): status is ProjectStatus => status !== "all",
);

const STATUS_HINTS: Record<ProjectStatus, string> = {
  draft: "Sin publicar",
  published: "Recibiendo propuestas",
  proposal_selected: "Desarrollador elegido, falta el pago",
  contracted: "Pago confirmado",
  closed: "Finalizados",
};

const STATUS_DOTS: Record<ProjectStatus, string> = {
  draft: "bg-muted-foreground",
  published: "bg-success-fg",
  proposal_selected: "bg-warning-icon",
  contracted: "bg-primary",
  closed: "bg-star",
};

type Props = { counts: ClientDashboard["counts"] };

export function DashboardStatusSummary({ counts }: Props) {
  return (
    <section aria-labelledby="dashboard-status-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="dashboard-status-title" className="text-base font-bold">
          Tus proyectos por estado
        </h2>
        <Link
          href="/dashboard/projects"
          className={cn(
            "inline-flex min-h-11 items-center rounded-sm text-[13px] text-muted-foreground underline underline-offset-2 hover:text-primary",
            FOCUS,
          )}
        >
          {counts.total} proyectos en total
        </Link>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {STATUSES.map((status) => {
          const count = counts.byStatus[status];
          return (
            <li key={status} className="flex">
              <Link
                href={`/dashboard/projects?status=${status}`}
                aria-label={`${PROJECT_STATUS_LABELS[status]}: ${count} proyectos`}
                className={cn(
                  "surface flex w-full flex-col gap-2.5 p-5 transition-colors hover:border-primary/50",
                  FOCUS,
                  count === 0 && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STATUS_DOTS[status])} />
                  {PROJECT_STATUS_LABELS[status]}
                </span>
                <span aria-hidden="true" className="text-[32px] leading-none font-extrabold">
                  {count}
                </span>
                <span aria-hidden="true" className="text-xs text-muted-foreground">
                  {STATUS_HINTS[status]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
