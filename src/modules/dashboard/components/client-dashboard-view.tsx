import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardContractingList } from "@/modules/dashboard/components/dashboard-contracting-list";
import { DashboardPendingActions } from "@/modules/dashboard/components/dashboard-pending-actions";
import { DashboardStatusSummary } from "@/modules/dashboard/components/dashboard-status-summary";
import type { ClientDashboard } from "@/modules/dashboard/types/dashboard.types";

const STEPS = [
  { title: "Publica", text: "Describe el proyecto, presupuesto y plazo." },
  { title: "Compara", text: "Revisa propuestas y perfiles de desarrolladores." },
  { title: "Elige y paga", text: "Pago de prueba con Stripe Checkout." },
  { title: "Valora", text: "Comparte tu experiencia al cerrar." },
];

function NewProjectLink({ label = "Nuevo proyecto" }: { label?: string }) {
  return (
    <Link href="/projects/new" className={buttonVariants({ size: "touch" })}>
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </Link>
  );
}

function ProjectFlowAside() {
  return (
    <aside className="flex min-w-0 flex-col gap-6 lg:w-80 lg:shrink-0">
      <section
        aria-labelledby="dashboard-flow-title"
        className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground"
      >
        <h2 id="dashboard-flow-title" className="text-base font-bold">
          Cómo avanza un proyecto
        </h2>
        <ol className="flex flex-col gap-3.5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-brand-deep text-[13px] font-extrabold text-secondary"
              >
                {index + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold">{step.title}</span>
                <span className="text-[13px] text-on-dark">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section
        role="note"
        aria-labelledby="dashboard-test-title"
        className="flex gap-3 rounded-2xl border border-warning-border bg-card p-5"
      >
        <svg
          aria-hidden="true"
          className="shrink-0 text-warning-icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        <div className="flex flex-col gap-1">
          <h2 id="dashboard-test-title" className="text-sm font-bold">
            Pagos en modo de prueba
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Los cobros y transferencias usan Stripe Test Mode. Ningún importe representa dinero real.
          </p>
        </div>
      </section>
    </aside>
  );
}

type Props = { data: ClientDashboard; firstName: string };

export function ClientDashboardView({ data, firstName }: Props) {
  const empty = data.counts.total === 0;

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            Panel del cliente
          </p>
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-[34px]">
            {firstName ? `Hola, ${firstName}` : "Hola"}
          </h1>
          <p className="text-[15px] text-muted-foreground">Esto es lo que necesita tu atención hoy.</p>
        </div>
        {empty ? null : (
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/projects"
              className={cn(buttonVariants({ variant: "outline", size: "touch" }), "text-primary")}
            >
              Ver todos mis proyectos
            </Link>
            <NewProjectLink />
          </div>
        )}
      </div>

      {empty ? (
        <EmptyState
          title="Aún no tienes proyectos"
          description="Publica tu primer proyecto y recibe propuestas de desarrolladores."
          action={<NewProjectLink label="Crear tu primer proyecto" />}
          className="surface border-solid"
        />
      ) : (
        <>
          <DashboardStatusSummary counts={data.counts} />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <DashboardPendingActions actions={data.pendingActions} />
              <DashboardContractingList items={data.contracting} total={data.contractingTotal} />
            </div>
            <ProjectFlowAside />
          </div>
        </>
      )}
    </main>
  );
}
