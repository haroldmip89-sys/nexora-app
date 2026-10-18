"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { withdrawProposalAction } from "@/modules/proposals/actions/proposal.actions";

type Props = { proposalId: string; className?: string };

/** Provisional `window.confirm` (spec 014 replaces it with a dialog). */
export function WithdrawProposalButton({ proposalId, className }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm("¿Retirar esta propuesta? No podrás enviar otra a este proyecto.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await withdrawProposalAction(proposalId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={handleClick}
        className={className ?? "h-9 px-3"}
      >
        {pending ? "Retirando..." : "Retirar"}
      </Button>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
