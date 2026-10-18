import type { Role } from "@/modules/auth/types/auth.types";

export type NavViewer =
  | { kind: "visitor" } // no session
  | { kind: "needs_onboarding" } // Clerk session without a Neon row
  | { kind: "user"; role: Role } // session + row; role comes from Neon
  | { kind: "degraded" }; // Clerk session, Neon read failed
