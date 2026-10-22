import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DashboardAction,
  DashboardActionKind,
} from "@/modules/dashboard/types/dashboard.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";

function actionHref(action: DashboardAction): string {
  const base = `/projects/${action.projectId}`;
  switch (action.kind) {
    case "choose_proposal":
      return `${base}/proposals`;
    case "start_payment":
    case "resume_payment":
      return `${base}/payment`;
    case "rate":
      return `${base}/rate`;
  }
}

const LABELS: Record<Exclude<DashboardActionKind, "choose_proposal">, string> = {
  start_payment: "Pagar (prueba)",
  resume_payment: "Continuar o cancelar el pago",
  rate: "Valorar al desarrollador",
};

function actionLabel(action: DashboardAction): string {
  if (action.kind === "choose_proposal") {
    return `Elegir propuesta (${action.pendingProposals ?? 0})`;
  }
  return LABELS[action.kind];
}

type Props = { actions: DashboardAction[] };

export function DashboardPendingActions({ actions }: Props) {
  return (
    <section aria-labelledby="dashboard-actions-title" className="mt-8">
      <h2 id="dashboard-actions-title" className="text-lg font-semibold text-[#202522]">
        Pendiente de ti
      </h2>
      {actions.length === 0 ? (
        <p className="mt-3 text-sm text-[#535E56]">No tienes nada pendiente.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {actions.map((action) => (
            <li
              key={`${action.kind}-${action.projectId}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-3 sm:px-4"
            >
              <span className="min-w-0 break-words text-sm font-medium text-[#202522]">
                {action.projectTitle}
              </span>
              <Link
                href={actionHref(action)}
                className={cn(buttonVariants(), "h-10 px-4", PRIMARY_LINK, FOCUS)}
              >
                {actionLabel(action)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
