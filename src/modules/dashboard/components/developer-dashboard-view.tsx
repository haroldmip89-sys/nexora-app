import { Search } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeveloperPayoutStatus } from "@/modules/dashboard/components/developer-payout-status";
import { DeveloperPendingActions } from "@/modules/dashboard/components/developer-pending-actions";
import { DeveloperProposalsSummary } from "@/modules/dashboard/components/developer-proposals-summary";
import { DeveloperRatingCard } from "@/modules/dashboard/components/developer-rating-card";
import { DeveloperWonProjects } from "@/modules/dashboard/components/developer-won-projects";
import type { DeveloperDashboard } from "@/modules/dashboard/types/developer-dashboard.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

type Props = { data: DeveloperDashboard; developerId: string; firstName: string };

export function DeveloperDashboardView({ data, developerId, firstName }: Props) {
  const empty = data.proposals.total === 0;

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-8 px-4 pt-10 pb-16 sm:px-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Panel del desarrollador
          </p>
          <h1 className="text-[34px] leading-[1.15] font-extrabold tracking-[-0.02em] text-foreground">
            {firstName ? `Hola, ${firstName}` : "Hola"}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Tus propuestas, proyectos ganados y cobros de prueba en un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/developers/${developerId}`}
            className={cn(buttonVariants({ variant: "outline", size: "touch" }), "text-primary", FOCUS)}
          >
            Ver mi perfil público
          </Link>
          <Link href="/projects" className={cn(buttonVariants({ size: "touch" }), FOCUS)}>
            <Search aria-hidden="true" className="size-[18px]" />
            Explorar proyectos
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
        <DeveloperPayoutStatus payouts={data.payouts} />
        <DeveloperRatingCard summary={data.ratings} developerId={developerId} />
      </div>

      {empty ? (
        <section aria-labelledby="developer-empty-title">
          <div className="surface flex flex-col items-center gap-2 p-6 text-center">
            <h2 id="developer-empty-title" className="text-lg font-medium text-foreground">
              Aún no has enviado propuestas
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Explora los proyectos publicados y envía tu primera propuesta.
            </p>
          </div>
        </section>
      ) : (
        <DeveloperProposalsSummary proposals={data.proposals} />
      )}

      <DeveloperPendingActions actions={data.pendingActions} />

      {empty ? null : <DeveloperWonProjects items={data.won} total={data.wonTotal} />}
    </main>
  );
}
