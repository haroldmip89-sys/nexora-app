import type { Action, Role } from "@/modules/auth/types/auth.types";

const PERMISSIONS: Record<Action, readonly Role[]> = {
  "catalog.view": ["client", "developer", "admin"],
  "project.create": ["client"],
  "project.update": ["client"],
  "project.publish": ["client"],
  "project.close": ["client", "admin"],
  "project.readPrivate": ["client", "admin"],
  "proposal.create": ["developer"],
  "proposal.withdraw": ["developer"],
  "proposal.read": ["client", "developer", "admin"],
  "proposal.select": ["client"],
  "payment.start": ["client"],
  "payment.read": ["client", "developer", "admin"],
  "payout.manage": ["developer"],
  "profile.edit": ["developer"],
  "rating.create": ["client"],
};

/** Role-level permission only; ownership is checked separately with requireOwnership. `null` = visitor. */
export function can(role: Role | null, action: Action): boolean {
  if (action === "catalog.view") return true;
  if (role === null) return false;
  return PERMISSIONS[action].includes(role);
}
