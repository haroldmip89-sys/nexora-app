import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DeveloperDashboard } from "@/modules/dashboard/types/developer-dashboard.types";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@/modules/proposals/types/proposal.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const STATUSES: { status: ProposalStatus; hint: string; dot: string }[] = [
  { status: "pending", hint: "Esperando decisión", dot: "bg-star" },
  { status: "accepted", hint: "Proyectos ganados", dot: "bg-primary" },
  { status: "rejected", hint: "Otra propuesta elegida", dot: "bg-[#9AA79D]" },
  { status: "withdrawn", hint: "Retiradas por ti", dot: "bg-input" },
];

type Props = { proposals: DeveloperDashboard["proposals"] };

export function DeveloperProposalsSummary({ proposals }: Props) {
  return (
    <section aria-labelledby="developer-proposals-title" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="developer-proposals-title" className="text-base font-bold text-foreground">
          Tus propuestas por estado
        </h2>
        <Link
          href="/dashboard/proposals"
          className={cn("inline-flex min-h-11 items-center rounded-lg text-sm font-bold text-primary underline", FOCUS)}
        >
          Ver todas mis propuestas
        </Link>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {STATUSES.map(({ status, hint, dot }) => {
          const count = proposals.byStatus[status];
          return (
            <li key={status}>
              <Link
                href={`/dashboard/proposals?status=${status}`}
                aria-label={`${PROPOSAL_STATUS_LABELS[status]}: ${count} propuestas`}
                className={cn(
                  "surface flex min-h-11 flex-col gap-2.5 p-5 transition-colors hover:border-primary/50",
                  FOCUS,
                  count === 0 && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
                  <span aria-hidden="true" className={cn("size-2 rounded-full", dot)} />
                  {PROPOSAL_STATUS_LABELS[status]}
                </span>
                <span aria-hidden="true" className="text-[32px] leading-none font-extrabold text-foreground">
                  {count}
                </span>
                <span aria-hidden="true" className="text-xs text-muted-foreground">
                  {hint}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
