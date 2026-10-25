// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getProposalAction, type ProposalAction } from "@/modules/projects/services/proposal-action";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

const ID = "a/b c?d";

describe("getProposalAction", () => {
  const cases: [string, NavViewer, ProposalAction | null][] = [
    [
      "visitor",
      { kind: "visitor" },
      {
        label: "Enviar propuesta",
        href: `/sign-in?redirect_url=${encodeURIComponent(`/projects/${ID}`)}`,
        locked: true,
      },
    ],
    ["needs_onboarding", { kind: "needs_onboarding" }, { label: "Completar registro", href: "/onboarding", locked: true }],
    [
      "developer",
      { kind: "user", role: "developer" },
      { label: "Enviar propuesta", href: `/projects/${ID}#propuesta`, locked: false },
    ],
    ["client", { kind: "user", role: "client" }, null],
    ["admin", { kind: "user", role: "admin" }, null],
    ["degraded", { kind: "degraded" }, null],
  ];

  it.each(cases)("%s", (_name, viewer, expected) => {
    expect(getProposalAction(viewer, ID)).toEqual(expected);
  });

  it("escapes the redirect_url fully", () => {
    const action = getProposalAction({ kind: "visitor" }, ID);
    expect(action?.href).toBe("/sign-in?redirect_url=%2Fprojects%2Fa%2Fb%20c%3Fd");
  });
});
