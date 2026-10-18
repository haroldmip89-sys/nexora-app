import { cn } from "@/lib/utils";

export type PaymentStepState = "complete" | "current" | "upcoming";

export type PaymentProgressProps = {
  /** Server-derived states for steps 2 and 3. Step 1 is always complete; step 4 never is. */
  paymentStep: PaymentStepState;
  confirmationStep: PaymentStepState;
  /** Optional short note under step 2 (e.g. "Iniciado"). */
  paymentNote?: string;
};

const STATE_TEXT: Record<PaymentStepState, string> = {
  complete: "Completado",
  current: "En curso",
  upcoming: "Pendiente",
};

type Step = { title: string; state: PaymentStepState; note: string };

export function PaymentProgress({ paymentStep, confirmationStep, paymentNote }: PaymentProgressProps) {
  const steps: Step[] = [
    { title: "Propuesta seleccionada", state: "complete", note: STATE_TEXT.complete },
    { title: "Pago de prueba", state: paymentStep, note: paymentNote ?? STATE_TEXT[paymentStep] },
    {
      title: "Confirmado por el servidor",
      state: confirmationStep,
      note: STATE_TEXT[confirmationStep],
    },
    // D-J: fixed text; the transfer is never shown as done or received.
    { title: "Transferencia al desarrollador", state: "upcoming", note: "Pendiente de implementación" },
  ];
  const currentIndex = steps.findIndex((step) => step.state === "current");

  return (
    <ol aria-label="Progreso del pago" className="grid gap-2 sm:grid-cols-2">
      {steps.map((step, index) => (
        <li
          key={step.title}
          aria-current={index === currentIndex ? "step" : undefined}
          className={cn(
            "flex items-start gap-3 rounded-[12px] border p-3",
            step.state === "current"
              ? "border-[#183D30] bg-[#F5F6F2]"
              : "border-[#E3E8E3] bg-white",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
              step.state === "complete" && "border-transparent bg-[#183D30] text-white",
              step.state === "current" && "border-[#183D30] bg-white text-[#183D30]",
              step.state === "upcoming" && "border-[#C9D1CA] bg-white text-[#535E56]",
            )}
          >
            {step.state === "complete" ? "✓" : index + 1}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-[#202522]">{step.title}</p>
            <p className="break-words text-xs text-[#535E56]">{step.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
