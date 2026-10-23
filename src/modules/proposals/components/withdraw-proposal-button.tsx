"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/announcer.store";
import { withdrawProposalAction } from "@/modules/proposals/actions/proposal.actions";

type Props = { proposalId: string; className?: string };

export function WithdrawProposalButton({ proposalId, className }: Props) {
  const openerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawProposalAction(proposalId);
      if (result.ok) {
        setOpen(false);
        announce("Propuesta retirada.");
        return;
      }
      setError(result.message);
    });
  }

  return (
    <>
      <Button
        ref={openerRef}
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => handleOpenChange(true)}
        className={className ?? "h-9 px-3"}
      >
        {pending ? "Retirando..." : "Retirar"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="¿Retirar esta propuesta?"
        description="No podrás enviar otra a este proyecto."
        confirmLabel="Retirar propuesta"
        pendingLabel="Retirando..."
        onConfirm={handleConfirm}
        pending={pending}
        error={error}
        finalFocus={openerRef}
      />
    </>
  );
}
