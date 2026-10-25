"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isAuthPath } from "@/lib/is-auth-path";

/** Renders its children everywhere except on sign-in and sign-up (e.g. the global footer). */
export function HideOnAuthRoutes({ children }: { children: ReactNode }) {
  return isAuthPath(usePathname()) ? null : <>{children}</>;
}
