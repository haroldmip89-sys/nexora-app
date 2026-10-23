"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/announcer.store";
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

type ConfirmKind = "unpublish" | "close";

const CONFIRMS: Record<
  ConfirmKind,
  {
    action: (id: string) => Promise<ProjectActionResult>;
    title: string;
    description: string;
    confirmLabel: string;
    pendingLabel: string;
    success: string;
    destructive: boolean;
  }
> = {
  unpublish: {
    action: unpublishProjectAction,
    title: "¿Despublicar este proyecto?",
    description: "Volverá a ser un borrador y dejará de ser visible.",
    confirmLabel: "Despublicar",
    pendingLabel: "Despublicando...",
    success: "Proyecto despublicado.",
    destructive: false,
  },
  close: {
    action: closeProjectAction,
    title: "¿Cerrar este proyecto?",
    description: "Esta acción no se puede deshacer.",
    confirmLabel: "Cerrar proyecto",
    pendingLabel: "Cerrando...",
    success: "Proyecto cerrado.",
    destructive: true,
  },
};

export function ProjectLifecycleActions({ projectId, status, proposalCount }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ConfirmKind>("close");
  const [dialogOpen, setDialogOpen] = useState(false);
  const unpublishRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const canPublish = status === "draft";
  const canUnpublish = status === "published" && proposalCount === 0;
  const canClose =
    status === "published" || status === "proposal_selected" || status === "contracted";

  if (!canPublish && !canUnpublish && !canClose) return null;

  function run(
    action: (id: string) => Promise<ProjectActionResult>,
    success: string,
    onDone?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(projectId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone?.();
      announce(success);
    });
  }

  function handleConfirmOpenChange(next: boolean) {
    if (next) return;
    setDialogOpen(false);
    setError(null);
  }

  function openConfirm(next: ConfirmKind) {
    setError(null);
    setKind(next);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canPublish ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(publishProjectAction, "Proyecto publicado.")}
            className="h-9 bg-[#183D30] px-3 text-white hover:bg-[#183D30]/90"
          >
            Publicar
          </Button>
        ) : null}
        {canUnpublish ? (
          <Button
            ref={unpublishRef}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => openConfirm("unpublish")}
            className="h-9 px-3"
          >
            Despublicar
          </Button>
        ) : null}
        {canClose ? (
          <Button
            ref={closeRef}
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => openConfirm("close")}
            className="h-9 px-3"
          >
            Cerrar
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={handleConfirmOpenChange}
        title={CONFIRMS[kind].title}
        description={CONFIRMS[kind].description}
        confirmLabel={CONFIRMS[kind].confirmLabel}
        pendingLabel={CONFIRMS[kind].pendingLabel}
        destructive={CONFIRMS[kind].destructive}
        pending={pending}
        error={error}
        finalFocus={kind === "close" ? closeRef : unpublishRef}
        onConfirm={() =>
          run(CONFIRMS[kind].action, CONFIRMS[kind].success, () => setDialogOpen(false))
        }
      />
      <div aria-live="polite">
        {error && !dialogOpen ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
