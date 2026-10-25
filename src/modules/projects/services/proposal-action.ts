import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

export type ProposalAction = { label: string; href: string; locked: boolean };

/**
 * Real navigation for "Enviar propuesta" on a project card (no modal).
 * The detail page validates role, ownership and payouts; this only routes.
 */
export function getProposalAction(viewer: NavViewer, projectId: string): ProposalAction | null {
  switch (viewer.kind) {
    case "visitor":
      return {
        label: "Enviar propuesta",
        href: `/sign-in?redirect_url=${encodeURIComponent(`/projects/${projectId}`)}`,
        locked: true,
      };
    case "needs_onboarding":
      return { label: "Completar registro", href: "/onboarding", locked: true };
    case "user":
      return viewer.role === "developer"
        ? { label: "Enviar propuesta", href: `/projects/${projectId}#propuesta`, locked: false }
        : null;
    case "degraded":
      return null;
  }
}
