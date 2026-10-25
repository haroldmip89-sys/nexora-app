// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getDashboardLink } from "@/modules/auth/services/dashboard-link";
import { getHomeCta, type HomeCta } from "@/modules/auth/services/home-cta";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

describe("getHomeCta", () => {
  const cases: [string, NavViewer, HomeCta][] = [
    ["visitor", { kind: "visitor" }, { kind: "visitor" }],
    ["client", { kind: "user", role: "client" }, { kind: "member", label: "Ir a mi panel", href: "/dashboard" }],
    ["developer", { kind: "user", role: "developer" }, { kind: "member", label: "Ir a mi panel", href: "/dashboard" }],
    ["needs_onboarding", { kind: "needs_onboarding" }, { kind: "member", label: "Completar registro", href: "/onboarding" }],
    ["admin", { kind: "user", role: "admin" }, { kind: "none" }],
    ["degraded", { kind: "degraded" }, { kind: "none" }],
  ];

  it.each(cases)("%s", (_name, viewer, expected) => {
    expect(getHomeCta(viewer)).toEqual(expected);
  });

  it("member href matches getDashboardLink", () => {
    const viewer: NavViewer = { kind: "user", role: "client" };
    const cta = getHomeCta(viewer);
    expect(cta.kind === "member" && cta.href).toBe(getDashboardLink(viewer)?.href);
  });
});
