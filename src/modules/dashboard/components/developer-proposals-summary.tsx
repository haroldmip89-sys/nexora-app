import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DeveloperDashboard } from "@/modules/dashboard/types/developer-dashboard.types";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@/modules/proposals/types/proposal.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const LINK =
  "flex min-h-11 items-center justify-between gap-3 rounded-[10px] border border-[#E3E8E3] bg-white px-3 py-2 text-sm transition-colors hover:border-[#183D30]/50";

const STATUSES: ProposalStatus[] = ["pending", "accepted", "rejected", "withdrawn"];

type Props = { proposals: DeveloperDashboard["proposals"] };

export function DeveloperProposalsSummary({ proposals }: Props) {
  return (
    <section aria-labelledby="developer-proposals-title" className="mt-8">
      <h2 id="developer-proposals-title" className="text-lg font-semibold text-[#202522]">
        Tus propuestas
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <li>
          <Link
            href="/dashboard/proposals"
            aria-label={`Todas: ${proposals.total} propuestas`}
            className={cn(LINK, FOCUS, "font-medium text-[#202522]")}
          >
            <span>Todas</span>
            <span aria-hidden="true">{proposals.total}</span>
          </Link>
        </li>
        {STATUSES.map((status) => {
          const count = proposals.byStatus[status];
          return (
            <li key={status}>
              <Link
                href={`/dashboard/proposals?status=${status}`}
                aria-label={`${PROPOSAL_STATUS_LABELS[status]}: ${count} propuestas`}
                className={cn(LINK, FOCUS, count === 0 ? "text-[#535E56] opacity-60" : "text-[#202522]")}
              >
                <span>{PROPOSAL_STATUS_LABELS[status]}</span>
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
