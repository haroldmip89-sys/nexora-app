import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  PaymentProgress,
  type PaymentProgressProps,
} from "@/modules/payments/components/payment-progress";
import { StartCheckoutButton } from "@/modules/payments/components/start-checkout-button";
import {
  PAYMENT_ATTEMPT_STATUS_LABELS,
  type PaymentAttemptStatus,
  type ProjectPaymentOverview,
} from "@/modules/payments/types/payment.types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";

type ReturnNotice = "success" | "cancel" | undefined;

// The notice is informative only: the query param is user-controlled and never
// affects the status panel or any status text.
const RETURN_NOTICES = {
  success: "Volviste desde Stripe. Esto no confirma el pago: esperamos la verificación del servidor.",
  cancel:
    "Volviste desde Stripe sin completar el pago desde esta pantalla. Puedes retomarlo cuando quieras.",
} as const;

const ATTEMPT_TEXT: Record<PaymentAttemptStatus, string> = {
  pending:
    "Pendiente de confirmación del servidor. Si ya pagaste en Stripe, esta página se actualizará cuando el servidor lo verifique (puede tardar unos segundos).",
  canceled: "El intento anterior se cerró sin completarse.",
  failed: "El intento anterior falló.",
  completed_test: "Pago de prueba confirmado por el servidor. No se movió dinero real.",
};

function badgeLabel(status: PaymentAttemptStatus): string {
  return status === "completed_test"
    ? `${PAYMENT_ATTEMPT_STATUS_LABELS.completed_test} · confirmado por el servidor`
    : PAYMENT_ATTEMPT_STATUS_LABELS[status];
}

function deriveProgress(overview: ProjectPaymentOverview): PaymentProgressProps {
  const status = overview.attempt?.status;
  if (status === "completed_test") return { paymentStep: "complete", confirmationStep: "complete" };
  if (status === "pending") {
    return { paymentStep: "current", confirmationStep: "current", paymentNote: "Iniciado" };
  }
  if (overview.canStart) return { paymentStep: "current", confirmationStep: "upcoming" };
  return { paymentStep: "upcoming", confirmationStep: "upcoming" };
}

type Props = { overview: ProjectPaymentOverview; returnNotice?: ReturnNotice };

export function PaymentPageView({ overview, returnNotice }: Props) {
  const { project, proposal, attempt, canStart, canResume } = overview;
  const closedWithoutPayment = !canStart && !canResume && attempt?.status !== "completed_test";
  const buttonLabel = canResume
    ? "Continuar en Stripe"
    : attempt
      ? "Reintentar pago de prueba"
      : "Pagar con Stripe (prueba)";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/projects"
        className={cn("text-sm font-medium text-[#183D30] underline", FOCUS)}
      >
        Volver a mis proyectos
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#535E56]">Pago de prueba</p>
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-[#202522]">
            {project.title}
          </h1>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      <p
        role="note"
        className="mt-4 rounded-[14px] border border-[#183D30] bg-[#DCE6DE] p-4 text-sm text-[#202522]"
      >
        <strong className="font-semibold">Modo de prueba de Stripe · No se mueve dinero real.</strong>{" "}
        Los pagos de prueba no son ingresos ni transferencias reales.
      </p>

      {returnNotice ? (
        <p
          role="status"
          className="mt-4 rounded-[14px] border border-[#E3E8E3] bg-[#F5F6F2] p-4 text-sm text-[#202522]"
        >
          {RETURN_NOTICES[returnNotice]}
        </p>
      ) : null}

      <section aria-labelledby="payment-progress-title" className="mt-6">
        <h2 id="payment-progress-title" className="mb-2 text-base font-semibold text-[#202522]">
          Progreso
        </h2>
        <PaymentProgress {...deriveProgress(overview)} />
      </section>

      <section
        aria-labelledby="payment-summary-title"
        className="mt-6 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
      >
        <h2 id="payment-summary-title" className="text-base font-semibold text-[#202522]">
          Resumen
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-[#535E56]">Proyecto</dt>
            <dd className="break-words text-[#202522]">{project.title}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[#535E56]">Desarrollador seleccionado</dt>
            <dd className="break-words text-[#202522]">{proposal.developerName}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#535E56]">Importe</dt>
            <dd className="text-[#202522]">{formatUsd(proposal.priceCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#535E56]">Plazo</dt>
            <dd className="text-[#202522]">{proposal.timelineWeeks} semanas</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="payment-status-title"
        className="mt-6 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="payment-status-title" className="text-base font-semibold text-[#202522]">
            Estado del pago
          </h2>
          {attempt ? (
            <Badge
              variant="outline"
              className="h-auto min-h-5 whitespace-normal border-[#183D30] bg-[#F5F6F2] py-0.5 text-center text-[#183D30]"
            >
              {badgeLabel(attempt.status)}
            </Badge>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-[#202522]">
          {attempt
            ? ATTEMPT_TEXT[attempt.status]
            : closedWithoutPayment
              ? "Este proyecto ya no admite un nuevo pago de prueba."
              : "Aún no iniciaste el pago de prueba."}
        </p>
        {attempt && closedWithoutPayment ? (
          <p className="mt-2 text-sm text-[#535E56]">
            Este proyecto ya no admite un nuevo pago de prueba.
          </p>
        ) : null}

        {canStart || canResume ? (
          <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
            <StartCheckoutButton projectId={project.id} label={buttonLabel} />
            {canResume ? (
              <Link
                href={`/projects/${project.id}/payment`}
                className={cn(
                  "inline-flex h-10 items-center text-sm font-medium text-[#183D30] underline",
                  FOCUS,
                )}
              >
                Actualizar estado
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      <p className="mt-6 text-sm text-[#535E56]">
        Volver desde Stripe no confirma el pago. El estado solo cambia cuando el servidor lo
        verifica.
      </p>
    </main>
  );
}
