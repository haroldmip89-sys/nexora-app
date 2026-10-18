import type { Role } from "@/modules/auth/types/auth.types";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

export type NavLinkItem = { href: string; label: string };

const ONBOARDING: NavLinkItem = { href: "/onboarding", label: "Completar registro" };

function roleLink(role: Role): NavLinkItem | null {
  switch (role) {
    case "client":
      return { href: "/dashboard/projects", label: "Mis proyectos" };
    case "developer":
      return { href: "/dashboard/proposals", label: "Mis propuestas" };
    case "admin":
      return null;
  }
}

/** Only place that knows the role -> dashboard map. Admin has no dashboard (null). */
export function getDashboardLink(viewer: NavViewer): NavLinkItem | null {
  switch (viewer.kind) {
    case "user":
      return roleLink(viewer.role);
    case "needs_onboarding":
      return ONBOARDING;
    case "visitor":
    case "degraded":
      return null;
  }
}
