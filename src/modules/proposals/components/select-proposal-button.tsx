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
import { selectProposalAction } from "@/modules/proposals/actions/proposal-selection.actions";

/** Error codes meaning the on-screen data is stale: reload and block re-confirming. */
const STALE_CODES = new Set([
  "PROPOSAL_CHANGED",
  "INVALID_STATE",
  "ALREADY_SELECTED",
  "PROJECT_NOT_OPEN",
  "NOT_FOUND",
]);

const CONSEQUENCES = [
  "Solo una propuesta puede ganar por proyecto.",
  "El proyecto deja de admitir nuevas propuestas.",
  "Las demás propuestas pendientes se marcan como rechazadas.",
  "Después continuarás con el pago de prueba (Test Mode; no se mueve dinero real).",
];

type Props = {
  projectId: string;
  proposalId: string;
  developerName: string;
  /** ISO-8601 with milliseconds of the proposal's `updatedAt` the client is viewing. */
  seenUpdatedAt: string;
};

export function SelectProposalButton({ projectId, proposalId, developerName, seenUpdatedAt }: Props) {
  const router = useRouter();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setError(null);
      setStale(false);
    } else if (stale) {
      // Closing (button or Escape) while stale reloads the data once.
      router.refresh();
    }
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await selectProposalAction(projectId, proposalId, seenUpdatedAt);
      if (result.ok) {
        setOpen(false);
        announce("Propuesta seleccionada. Continúa con el pago de prueba.");
        return;
      }
      setError(result.message);
      if (STALE_CODES.has(result.code)) setStale(true);
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="h-10 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
      >
        Seleccionar esta propuesta
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent
          initialFocus={cancelRef}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words text-[#202522]">
              ¿Seleccionar la propuesta de {developerName}?
            </AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="text-left text-[#535E56]">
              <p>Esta acción no se puede deshacer. Al confirmar:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {CONSEQUENCES.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div aria-live="polite">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending} className="h-10 px-4">
              {stale ? "Cerrar y recargar" : "Cancelar"}
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={pending || stale}
              onClick={handleConfirm}
              className="h-10 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
            >
              {pending ? "Seleccionando..." : "Confirmar selección"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
