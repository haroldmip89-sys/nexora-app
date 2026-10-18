"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startPayoutOnboardingAction } from "@/modules/payments/actions/connected-account.actions";

type Props = { label: string };

export function StartPayoutOnboardingButton({ label }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to Stripe and never returns.
      const result = await startPayoutOnboardingAction();
      if (result && !result.ok) {
        setError(result.message);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="h-10 min-w-11 bg-[#183D30] px-4 text-white outline-none hover:bg-[#183D30]/90 focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
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
