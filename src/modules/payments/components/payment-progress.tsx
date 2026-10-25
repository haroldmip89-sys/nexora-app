import { cn } from "@/lib/utils";

export type PaymentStepState = "complete" | "current" | "upcoming";

export type PaymentProgressProps = {
  /** Server-derived states for steps 2 to 4. Step 1 is always complete. */
  paymentStep: PaymentStepState;
  confirmationStep: PaymentStepState;
  /** Test transfer step (spec 011b RF6); never shown as money received. */
  transferStep: PaymentStepState;
  /** Optional short note under step 2 (e.g. "Iniciado"). */
  paymentNote?: string;
  /** Optional short note under step 4 (e.g. "Transferencia de prueba pendiente"). */
  transferNote?: string;
};

const STATE_TEXT: Record<PaymentStepState, string> = {
  complete: "Completado",
  current: "En curso",
  upcoming: "Pendiente",
};

type Step = { title: string; state: PaymentStepState; note: string };

export function PaymentProgress({
  paymentStep,
  confirmationStep,
  transferStep,
  paymentNote,
  transferNote,
}: PaymentProgressProps) {
  const steps: Step[] = [
    { title: "Propuesta seleccionada", state: "complete", note: STATE_TEXT.complete },
    { title: "Pago de prueba", state: paymentStep, note: paymentNote ?? STATE_TEXT[paymentStep] },
    {
      title: "Confirmado por el servidor",
      state: confirmationStep,
      note: STATE_TEXT[confirmationStep],
    },
    {
      title: "Transferencia al desarrollador",
      state: transferStep,
      note: transferNote ?? STATE_TEXT[transferStep],
    },
  ];
  const currentIndex = steps.findIndex((step) => step.state === "current");

  return (
    <ol aria-label="Progreso del pago" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step.title}
          aria-current={index === currentIndex ? "step" : undefined}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3.5",
            step.state === "current"
              ? "border-primary bg-surface-soft"
              : "border-border bg-card",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
              step.state === "complete" && "border-transparent bg-primary text-primary-foreground",
              step.state === "current" && "border-primary bg-card text-primary",
              step.state === "upcoming" && "border-border bg-card text-muted-foreground",
            )}
          >
            {step.state === "complete" ? "✓" : index + 1}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-foreground">{step.title}</p>
            <p
              className={cn(
                "break-words text-xs",
                step.state === "complete" && "text-success-fg",
                step.state === "current" && "text-warning-fg",
                step.state === "upcoming" && "text-muted-foreground",
              )}
            >
              {step.note}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
