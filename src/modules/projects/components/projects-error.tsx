"use client";

import { Button } from "@/components/ui/button";

export function ProjectsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-[#E3E8E3] bg-white p-6"
      >
        <h1 className="text-lg font-semibold text-[#202522]">
          No pudimos cargar tus proyectos
        </h1>
        <p className="text-sm text-[#535E56]">
          Ocurrió un problema inesperado. Inténtalo de nuevo en unos segundos.
        </p>
        <Button
          type="button"
          onClick={reset}
          className="h-10 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
        >
          Reintentar
        </Button>
      </div>
    </main>
  );
}
