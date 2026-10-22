import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeveloperPayoutStatus } from "@/modules/dashboard/components/developer-payout-status";
import { DeveloperPendingActions } from "@/modules/dashboard/components/developer-pending-actions";
import { DeveloperProposalsSummary } from "@/modules/dashboard/components/developer-proposals-summary";
import { DeveloperWonProjects } from "@/modules/dashboard/components/developer-won-projects";
import type { DeveloperDashboard } from "@/modules/dashboard/types/developer-dashboard.types";
import { RatingSummary } from "@/modules/ratings/components/rating-summary";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";

type Props = { data: DeveloperDashboard; developerId: string };

export function DeveloperDashboardView({ data, developerId }: Props) {
  const empty = data.proposals.total === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Mi panel</h1>
        {empty ? null : (
          <Link
            href="/dashboard/proposals"
            className={cn("inline-flex min-h-10 items-center text-sm font-medium text-[#183D30] underline", FOCUS)}
          >
            Ver todas mis propuestas
          </Link>
        )}
      </div>

      <DeveloperPendingActions actions={data.pendingActions} />
      <DeveloperPayoutStatus payouts={data.payouts} />

      {empty ? (
        <section aria-labelledby="developer-empty-title" className="mt-8">
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-[#E3E8E3] bg-white p-6 text-center">
            <h2 id="developer-empty-title" className="text-lg font-medium text-[#202522]">
              Aún no has enviado propuestas
            </h2>
            <p className="max-w-md text-sm text-[#535E56]">
              Explora los proyectos publicados y envía tu primera propuesta.
            </p>
            <Link
              href="/projects"
              className={cn(buttonVariants({ size: "lg" }), "mt-2 h-10 rounded-[10px] px-4", PRIMARY_LINK, FOCUS)}
            >
              Explorar proyectos
            </Link>
          </div>
        </section>
      ) : (
        <>
          <DeveloperProposalsSummary proposals={data.proposals} />
          <DeveloperWonProjects items={data.won} total={data.wonTotal} />
        </>
      )}

      <section aria-labelledby="developer-ratings-title" className="mt-8">
        <h2 id="developer-ratings-title" className="text-lg font-semibold text-[#202522]">
          Tus valoraciones
        </h2>
        <div className="mt-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4">
          <RatingSummary summary={data.ratings} developerId={developerId} />
        </div>
      </section>
    </main>
  );
}
