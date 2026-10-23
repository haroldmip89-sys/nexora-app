"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/announcer.store";
import { retryTransfersAction } from "@/modules/payments/actions/developer-transfer.actions";

export function RetryTransfersButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await retryTransfersAction();
      if (result.ok) {
        announce("Transferencias reintentadas. Revisa el estado actualizado.");
        router.refresh();
      } else {
        setError(result.message);
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
        {pending ? "Reintentando..." : "Reintentar transferencia"}
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
