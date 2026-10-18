import { describe, expect, it } from "vitest";
import { getAccountLink, getDashboardLink } from "@/modules/auth/services/dashboard-link";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

describe("getDashboardLink", () => {
  const cases: [string, NavViewer, { href: string; label: string } | null][] = [
    ["client", { kind: "user", role: "client" }, { href: "/dashboard/projects", label: "Mis proyectos" }],
    ["developer", { kind: "user", role: "developer" }, { href: "/dashboard/proposals", label: "Mis propuestas" }],
    ["needs_onboarding", { kind: "needs_onboarding" }, { href: "/onboarding", label: "Completar registro" }],
    ["admin", { kind: "user", role: "admin" }, null],
    ["visitor", { kind: "visitor" }, null],
    ["degraded", { kind: "degraded" }, null],
  ];

  it.each(cases)("%s", (_name, viewer, expected) => {
    expect(getDashboardLink(viewer)).toEqual(expected);
  });
});

describe("getAccountLink", () => {
  const link = { href: "/dashboard/account", label: "Mi cuenta" };
  const cases: [string, NavViewer, { href: string; label: string } | null][] = [
    ["developer", { kind: "user", role: "developer" }, link],
    ["client", { kind: "user", role: "client" }, null],
    ["admin", { kind: "user", role: "admin" }, null],
    ["needs_onboarding", { kind: "needs_onboarding" }, null],
    ["visitor", { kind: "visitor" }, null],
    ["degraded", { kind: "degraded" }, null],
  ];

  it.each(cases)("%s", (_name, viewer, expected) => {
    expect(getAccountLink(viewer)).toEqual(expected);
  });
});
