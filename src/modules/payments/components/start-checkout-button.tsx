"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startCheckoutAction } from "@/modules/payments/actions/payment.actions";

/** Codes meaning the on-screen data is stale: reload the page state. */
const STALE_CODES = new Set(["PAYMENT_NOT_ALLOWED", "PAYMENT_ALREADY_ACTIVE", "NOT_FOUND"]);

type Props = { projectId: string; label: string };

export function StartCheckoutButton({ projectId, label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to Stripe and never returns.
      const result = await startCheckoutAction(projectId);
      if (result && !result.ok) {
        setError(result.message);
        if (STALE_CODES.has(result.code)) router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="h-10 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
      >
        {pending ? "Redirigiendo a Stripe..." : label}
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
