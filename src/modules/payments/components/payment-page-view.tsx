import { DeveloperProfileLink } from "@/components/shared/developer-profile-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CancelPaymentButton } from "@/modules/payments/components/cancel-payment-button";
import {
  PaymentProgress,
  type PaymentProgressProps,
} from "@/modules/payments/components/payment-progress";
import { PaymentStatusBadge } from "@/modules/payments/components/payment-status-badge";
import { RefreshPaymentButton } from "@/modules/payments/components/refresh-payment-button";
import { StartCheckoutButton } from "@/modules/payments/components/start-checkout-button";
import {
  TRANSFER_TEST_NOTICE,
  type DeveloperTransferStatus,
  type ProjectTransferSummary,
} from "@/modules/payments/types/developer-transfer.types";
import {
  type PaymentAttemptStatus,
  type ProjectPaymentOverview,
} from "@/modules/payments/types/payment.types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

type ReturnNotice = "success" | "cancel" | undefined;

// The notice is informative only: the query param is user-controlled and never
// affects the status panel or any status text.
const RETURN_NOTICES = {
  success: "Volviste desde Stripe. Esto no confirma el pago: esperamos la verificación del servidor.",
  cancel:
    "Volviste desde Stripe sin completar el pago desde esta pantalla. Puedes retomarlo cuando quieras.",
} as const;

const ATTEMPT_TEXT: Record<Exclude<PaymentAttemptStatus, "completed_test">, string> = {
  pending:
    "Pendiente de confirmación del servidor. Si ya pagaste en Stripe, puede tardar unos segundos; usa «Actualizar estado» para consultar de nuevo.",
  canceled: "El intento anterior se cerró sin completarse.",
  failed: "El intento anterior falló.",
};

const TRANSFER_TEXT: Record<DeveloperTransferStatus, string> = {
  pending: "Transferencia de prueba pendiente",
  completed_test: "Transferencia de prueba completada",
  failed: "Transferencia de prueba fallida; el desarrollador puede reintentarla",
};

function attemptText(
  status: PaymentAttemptStatus,
  projectStatus: string,
  transfer: ProjectTransferSummary | null,
): string {
  if (status !== "completed_test") return ATTEMPT_TEXT[status];
  const base =
    projectStatus === "contracted"
      ? "Pago de prueba confirmado por el servidor. El proyecto está en contratación. No se movió dinero real."
      : "Pago de prueba confirmado por el servidor. No se movió dinero real.";
  return transfer ? `${base} ${TRANSFER_TEXT[transfer.status]}.` : base;
}

function deriveProgress(overview: ProjectPaymentOverview): PaymentProgressProps {
  const status = overview.attempt?.status;
  if (status === "completed_test") {
    const transfer = overview.transfer;
    const base = { paymentStep: "complete", confirmationStep: "complete" } as const;
    if (!transfer) return { ...base, transferStep: "upcoming" };
    return {
      ...base,
      transferStep: transfer.status === "completed_test" ? "complete" : "current",
      transferNote: TRANSFER_TEXT[transfer.status],
    };
  }
  if (status === "pending") {
    return {
      paymentStep: "current",
      confirmationStep: "current",
      transferStep: "upcoming",
      paymentNote: "Iniciado",
    };
  }
  if (overview.canStart) {
    return { paymentStep: "current", confirmationStep: "upcoming", transferStep: "upcoming" };
  }
  return { paymentStep: "upcoming", confirmationStep: "upcoming", transferStep: "upcoming" };
}

type Props = { overview: ProjectPaymentOverview; returnNotice?: ReturnNotice };

export function PaymentPageView({ overview, returnNotice }: Props) {
  const { project, proposal, attempt, canStart, canResume, transfer, developerPayoutsReady } = overview;
  const awaitingDeveloper =
    !developerPayoutsReady && project.status === "proposal_selected" && !canResume && attempt?.status !== "completed_test";
  const closedWithoutPayment =
    !canStart && !canResume && !awaitingDeveloper && attempt?.status !== "completed_test";
  const buttonLabel = canResume
    ? "Continuar en Stripe"
    : attempt
      ? "Reintentar pago de prueba"
      : "Pagar con Stripe (prueba)";
  const completed = attempt?.status === "completed_test";

  return (
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <Breadcrumb aria-label="Ruta">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard" className={cn("rounded-sm", FOCUS)} />}>
              Mi panel
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href={`/projects/${project.id}`} className={cn("rounded-sm", FOCUS)} />}
            >
              {project.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Pago de prueba</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight text-foreground">
            Pago de prueba
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{project.title}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <p
        role="note"
        className="mt-4 rounded-xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg"
      >
        <strong className="font-semibold">Modo de prueba de Stripe · No se mueve dinero real.</strong>{" "}
        Los pagos de prueba no son ingresos ni transferencias reales.
      </p>

      {returnNotice ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border bg-surface-subtle p-4 text-sm text-foreground"
        >
          {RETURN_NOTICES[returnNotice]}
        </p>
      ) : null}

      <section aria-labelledby="payment-progress-title" className="mt-6">
        <h2 id="payment-progress-title" className="mb-2 text-base font-semibold text-foreground">
          Progreso
        </h2>
        <PaymentProgress {...deriveProgress(overview)} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="payment-status-title" className="surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="payment-status-title" className="text-base font-semibold text-foreground">
                Estado del pago
              </h2>
              {attempt ? (
                <PaymentStatusBadge status={attempt.status} />
              ) : (
                <Badge variant="neutral">No iniciado</Badge>
              )}
            </div>

            <p className="mt-2 text-sm text-foreground">
              {attempt
                ? attemptText(attempt.status, project.status, transfer)
                : awaitingDeveloper
                  ? "El desarrollador aún no configuró sus cobros de prueba. Podrás pagar cuando lo haga."
                  : closedWithoutPayment
                    ? "Este proyecto ya no admite un nuevo pago de prueba."
                    : "Aún no iniciaste el pago de prueba."}
            </p>
            {completed ? (
              <p className="mt-2 text-xs text-muted-foreground">{TRANSFER_TEST_NOTICE}</p>
            ) : null}
            {attempt && closedWithoutPayment ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Este proyecto ya no admite un nuevo pago de prueba.
              </p>
            ) : null}

            {canStart || canResume ? (
              <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
                <StartCheckoutButton projectId={project.id} label={buttonLabel} />
                {canResume ? (
                  <>
                    <RefreshPaymentButton projectId={project.id} />
                    <CancelPaymentButton projectId={project.id} />
                  </>
                ) : null}
              </div>
            ) : null}

            {completed ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/dashboard"
                  className={cn(buttonVariants({ variant: "outline", size: "touch" }), FOCUS)}
                >
                  Volver a mi panel
                </Link>
                {project.status === "contracted" ? (
                  <Link
                    href={`/projects/${project.id}/rate`}
                    className={cn(buttonVariants({ size: "touch" }), FOCUS)}
                  >
                    Valorar al desarrollador
                  </Link>
                ) : null}
              </div>
            ) : null}

            <p className="mt-4 border-t border-divider pt-3 text-sm text-muted-foreground">
              Volver desde Stripe no confirma el pago. El estado solo cambia cuando el servidor lo
              verifica.
            </p>
          </section>

          <section aria-labelledby="payment-developer-title" className="surface p-4 sm:p-5">
            <h2 id="payment-developer-title" className="text-base font-semibold text-foreground">
              Desarrollador seleccionado
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <UserAvatar name={proposal.developerName} imageUrl={proposal.imageUrl} size="lg" />
              <p className="min-w-0 break-words text-base font-semibold text-foreground">
                <DeveloperProfileLink
                  developerId={proposal.developerId}
                  name={proposal.developerName}
                />
              </p>
            </div>
          </section>
        </div>

        <aside
          aria-labelledby="payment-summary-title"
          className="surface min-w-0 overflow-hidden lg:sticky lg:top-24"
        >
          <div className="p-4 sm:p-5">
            <h2 id="payment-summary-title" className="text-base font-semibold text-foreground">
              Resumen
            </h2>
            <dl className="mt-3 grid grid-cols-1 gap-y-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Proyecto</dt>
                <dd className="break-words text-foreground">{project.title}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Desarrollador seleccionado</dt>
                <dd className="break-words text-foreground">{proposal.developerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Importe</dt>
                <dd className="text-foreground">{formatUsd(proposal.priceCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Plazo</dt>
                <dd className="text-foreground">{proposal.timelineWeeks} semanas</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Método</dt>
                <dd className="text-foreground">Stripe Checkout</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Para probar usa la tarjeta 4242 4242 4242 4242 con cualquier fecha futura y CVC.
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-divider bg-surface-subtle p-4 sm:p-5">
            <p className="text-sm font-semibold text-foreground">Total de prueba</p>
            <p className="text-foreground">
              <span className="text-2xl font-extrabold">{formatUsd(proposal.priceCents)}</span>{" "}
              <span className="text-xs text-muted-foreground">USD</span>
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
