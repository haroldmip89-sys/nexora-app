"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "@/modules/auth/actions/complete-onboarding.action";
import type { OnboardingInput } from "@/modules/auth/schemas/onboarding.schema";

type RoleOption = {
  value: OnboardingInput["role"];
  title: string;
  description: string;
};

const OPTIONS: RoleOption[] = [
  {
    value: "client",
    title: "Necesito un desarrollador",
    description: "Publica tus proyectos y recibe propuestas de desarrolladores.",
  },
  {
    value: "developer",
    title: "Soy desarrollador",
    description: "Explora proyectos y envía propuestas a los clientes.",
  },
];

export function RoleSelector() {
  const [role, setRole] = useState<OnboardingInput["role"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const groupId = useId();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      setError("Selecciona una opción para continuar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding({ role });
      // On success the action redirects and never returns.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={error ? `${groupId}-error` : undefined}
      >
        <legend className="sr-only">Elige cómo usarás Nexora</legend>
        {OPTIONS.map((option) => {
          const selected = role === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition-colors",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[#183D30]/40",
                selected
                  ? "border-[#183D30] bg-[#DCE6DE]"
                  : "border-[#E3E8E3] hover:border-[#183D30]/50",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={selected}
                onChange={() => setRole(option.value)}
                disabled={pending}
                className="mt-1 size-4 accent-[#183D30]"
              />
              <span className="flex flex-col gap-1">
                <span className="text-base font-semibold text-[#202522]">{option.title}</span>
                <span className="text-sm text-[#535E56]">{option.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {error ? (
        <p id={`${groupId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-11 bg-[#183D30] text-white hover:bg-[#183D30]/90"
      >
        {pending ? "Guardando..." : "Continuar"}
      </Button>
    </form>
  );
}
