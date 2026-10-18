"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshPaymentStatusAction } from "@/modules/payments/actions/payment-reconciliation.actions";
import type { ReconcileResult } from "@/modules/payments/types/payment.types";

const OUTCOME_TEXT: Record<ReconcileResult["outcome"], string> = {
  completed: "Pago de prueba confirmado por el servidor.",
  canceled: "El intento se cerró sin completarse.",
  unchanged: "Stripe todavía no confirma el pago.",
  none: "No hay un intento de pago para consultar.",
};

type Feedback = { kind: "status" | "alert"; text: string };

type Props = { projectId: string };

export function RefreshPaymentButton({ projectId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function handleClick() {
    setFeedback(null);
    startTransition(async () => {
      const result = await refreshPaymentStatusAction(projectId);
      if (result.ok) {
        setFeedback({ kind: "status", text: OUTCOME_TEXT[result.outcome] });
        router.refresh();
      } else {
        setFeedback({ kind: "alert", text: result.message });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={handleClick}
        className="h-11 min-w-11 px-4 outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
      >
        {pending ? "Actualizando..." : "Actualizar estado"}
      </Button>
      <div aria-live="polite">
        {feedback ? (
          <p
            role={feedback.kind}
            className={
              feedback.kind === "alert" ? "text-sm text-destructive" : "text-sm text-[#202522]"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
