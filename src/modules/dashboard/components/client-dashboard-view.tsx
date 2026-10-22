import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardContractingList } from "@/modules/dashboard/components/dashboard-contracting-list";
import { DashboardPendingActions } from "@/modules/dashboard/components/dashboard-pending-actions";
import { DashboardStatusSummary } from "@/modules/dashboard/components/dashboard-status-summary";
import type { ClientDashboard } from "@/modules/dashboard/types/dashboard.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";

function NewProjectLink({ label = "Nuevo proyecto" }: { label?: string }) {
  return (
    <Link
      href="/projects/new"
      className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-[10px] px-4", PRIMARY_LINK, FOCUS)}
    >
      {label}
    </Link>
  );
}

type Props = { data: ClientDashboard };

export function ClientDashboardView({ data }: Props) {
  const empty = data.counts.total === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Mi panel</h1>
        {empty ? null : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/dashboard/projects"
              className={cn("inline-flex min-h-10 items-center text-sm font-medium text-[#183D30] underline", FOCUS)}
            >
              Ver todos mis proyectos
            </Link>
            <NewProjectLink />
          </div>
        )}
      </div>

      {empty ? (
        <div className="mt-6">
          <EmptyState
            title="Aún no tienes proyectos"
            description="Publica tu primer proyecto y recibe propuestas de desarrolladores."
            action={<NewProjectLink label="Crear tu primer proyecto" />}
            className="border-[#E3E8E3] bg-white"
          />
        </div>
      ) : (
        <>
          <DashboardPendingActions actions={data.pendingActions} />
          <DashboardStatusSummary counts={data.counts} />
          <DashboardContractingList items={data.contracting} total={data.contractingTotal} />
        </>
      )}
    </main>
  );
}
