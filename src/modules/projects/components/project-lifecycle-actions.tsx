"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  closeProjectAction,
  publishProjectAction,
  unpublishProjectAction,
} from "@/modules/projects/actions/project.actions";
import type {
  ProjectActionResult,
  ProjectStatus,
} from "@/modules/projects/types/project.types";

type Props = {
  projectId: string;
  status: ProjectStatus;
  proposalCount: number;
};

export function ProjectLifecycleActions({ projectId, status, proposalCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canPublish = status === "draft";
  const canUnpublish = status === "published" && proposalCount === 0;
  const canClose =
    status === "published" || status === "proposal_selected" || status === "contracted";

  if (!canPublish && !canUnpublish && !canClose) return null;

  function run(
    action: (id: string) => Promise<ProjectActionResult>,
    confirmMessage?: string,
  ) {
    // Provisional confirmation (spec 014 replaces it with a dialog).
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(projectId);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canPublish ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(publishProjectAction)}
            className="h-9 bg-[#183D30] px-3 text-white hover:bg-[#183D30]/90"
          >
            Publicar
          </Button>
        ) : null}
        {canUnpublish ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                unpublishProjectAction,
                "¿Despublicar este proyecto? Volverá a ser un borrador y dejará de ser visible.",
              )
            }
            className="h-9 px-3"
          >
            Despublicar
          </Button>
        ) : null}
        {canClose ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(
                closeProjectAction,
                "¿Cerrar este proyecto? Esta acción no se puede deshacer.",
              )
            }
            className="h-9 px-3"
          >
            Cerrar
          </Button>
        ) : null}
      </div>
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
