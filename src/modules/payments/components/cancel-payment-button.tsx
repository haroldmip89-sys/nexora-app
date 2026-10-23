"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/announcer.store";
import { cancelPendingPaymentAction } from "@/modules/payments/actions/payment-cancellation.actions";
import type { CancelPaymentResult } from "@/modules/payments/types/payment.types";

const OUTCOME_TEXT: Record<CancelPaymentResult["outcome"], string> = {
  canceled: "Pago de prueba cancelado. Ya puedes reintentar el pago o cerrar el proyecto.",
  completed: "El pago se completó antes de poder cancelarlo. Ya está confirmado.",
  none: "No hay un pago pendiente que cancelar.",
};

type Feedback = { kind: "status" | "alert"; text: string };

type Props = { projectId: string };

export function CancelPaymentButton({ projectId }: Props) {
  const router = useRouter();
  const backRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
  }

  function showFeedback(next: Feedback) {
    setFeedback(next);
    announce(next.text, next.kind);
  }

  function handleConfirm() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await cancelPendingPaymentAction(projectId);
        setOpen(false);
        if (result.ok) {
          showFeedback({ kind: "status", text: OUTCOME_TEXT[result.outcome] });
        } else {
          showFeedback({ kind: "alert", text: result.message });
        }
        router.refresh();
      } catch {
        setOpen(false);
        showFeedback({
          kind: "alert",
          text: "No pudimos completar la acción. Inténtalo de nuevo.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => handleOpenChange(true)}
        className="h-11 min-w-11 px-4 outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
      >
        {pending ? "Cancelando..." : "Cancelar pago de prueba"}
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent
          initialFocus={backRef}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#202522]">¿Cancelar el pago de prueba?</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-[#535E56]">
              Cerraremos la sesión de pago en Stripe. Si ya pagaste, la cancelación no se aplicará y
              el pago se confirmará. Después podrás reintentar el pago o cerrar el proyecto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={backRef} disabled={pending} className="h-11 px-4">
              Volver
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={pending}
              onClick={handleConfirm}
              className="h-11 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
            >
              {pending ? "Cancelando..." : "Cancelar pago de prueba"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {feedback ? (
        <p
          className={
            feedback.kind === "alert" ? "text-sm text-destructive" : "text-sm text-[#202522]"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
