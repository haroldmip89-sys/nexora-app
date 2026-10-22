import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ClientDashboard } from "@/modules/dashboard/types/dashboard.types";
import { PROJECT_LIST_STATUSES } from "@/modules/projects/schemas/project.schema";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/modules/projects/types/project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const LINK =
  "flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-[#E3E8E3] bg-white px-3 py-2 text-sm transition-colors hover:border-[#183D30]/50";

const STATUSES = PROJECT_LIST_STATUSES.filter(
  (status): status is ProjectStatus => status !== "all",
);

type Props = { counts: ClientDashboard["counts"] };

export function DashboardStatusSummary({ counts }: Props) {
  return (
    <section aria-labelledby="dashboard-status-title" className="mt-8">
      <h2 id="dashboard-status-title" className="text-lg font-semibold text-[#202522]">
        Tus proyectos por estado
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <li>
          <Link
            href="/dashboard/projects"
            aria-label={`Todos: ${counts.total} proyectos`}
            className={cn(LINK, FOCUS, "font-medium text-[#202522]")}
          >
            <span>Todos</span>
            <span aria-hidden="true">{counts.total}</span>
          </Link>
        </li>
        {STATUSES.map((status) => {
          const count = counts.byStatus[status];
          return (
            <li key={status}>
              <Link
                href={`/dashboard/projects?status=${status}`}
                aria-label={`${PROJECT_STATUS_LABELS[status]}: ${count} proyectos`}
                className={cn(LINK, FOCUS, count === 0 ? "text-[#535E56] opacity-60" : "text-[#202522]")}
              >
                <span>{PROJECT_STATUS_LABELS[status]}</span>
                <span aria-hidden="true" className="font-medium">
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
