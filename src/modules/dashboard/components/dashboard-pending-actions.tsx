import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  DashboardAction,
  DashboardActionKind,
} from "@/modules/dashboard/types/dashboard.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

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

const TITLES: Record<DashboardActionKind, string> = {
  choose_proposal: "Elige una propuesta",
  start_payment: "Completa el pago de prueba",
  resume_payment: "Completa el pago de prueba",
  rate: "Valora al desarrollador",
};

const ICON_PATHS: Record<DashboardActionKind, string> = {
  choose_proposal: "M4 6h16M4 12h10M4 18h7",
  start_payment: "M3 7h18v10H3zM3 11h18",
  resume_payment: "M3 7h18v10H3zM3 11h18",
  rate: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
};

function actionLabel(action: DashboardAction): string {
  if (action.kind === "choose_proposal") {
    return `Elegir propuesta (${action.pendingProposals ?? 0})`;
  }
  return LABELS[action.kind];
}

function actionDetail(action: DashboardAction): string {
  if (action.kind !== "choose_proposal") return action.projectTitle;
  const n = action.pendingProposals ?? 0;
  return `${action.projectTitle} · ${n} ${n === 1 ? "propuesta pendiente" : "propuestas pendientes"}`;
}

type Props = { actions: DashboardAction[] };

export function DashboardPendingActions({ actions }: Props) {
  return (
    <section aria-labelledby="dashboard-actions-title" className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2 id="dashboard-actions-title" className="text-base font-bold">
          Acciones pendientes
        </h2>
        {actions.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-primary">
            {actions.length} por hacer
          </span>
        ) : null}
      </div>
      {actions.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted-foreground">No tienes nada pendiente.</p>
      ) : (
        <ul>
          {actions.map((action) => (
            <li
              key={`${action.kind}-${action.projectId}`}
              className="flex flex-wrap items-center gap-4 border-b border-divider px-6 py-4 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-subtle text-primary"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={ICON_PATHS[action.kind]} />
                </svg>
              </span>
              <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{TITLES[action.kind]}</span>
                <span className="text-[13px] break-words text-muted-foreground">
                  {actionDetail(action)}
                </span>
              </div>
              <Link
                href={actionHref(action)}
                className={cn(buttonVariants({ size: "touch" }), FOCUS)}
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
