import { getDashboardLink } from "@/modules/auth/services/dashboard-link";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

export type HomeCta =
  | { kind: "visitor" } // no session: sign-up CTAs
  | { kind: "member"; label: string; href: string } // session: jump to the panel
  | { kind: "none" }; // admin or degraded: no account CTA

const PANEL_LABEL = "Ir a mi panel";

/** Account CTA for the landing. The destination comes from getDashboardLink (single role -> route map). */
export function getHomeCta(viewer: NavViewer): HomeCta {
  if (viewer.kind === "visitor") return { kind: "visitor" };

  const link = getDashboardLink(viewer);
  if (!link) return { kind: "none" };

  return {
    kind: "member",
    label: viewer.kind === "user" ? PANEL_LABEL : link.label,
    href: link.href,
  };
}
