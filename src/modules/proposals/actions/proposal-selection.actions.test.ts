// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  selectProposal: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/modules/auth/services/current-user.service", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/modules/proposals/services/proposal-selection.service", () => ({
  selectProposal: mocks.selectProposal,
}));
vi.mock("@/modules/security/services/rate-limit.service", () => ({
  RATE_LIMITED_MESSAGE: "limited",
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  PROPOSAL_SELECTION_ERROR_MESSAGES,
  ProposalError,
  type ProposalErrorCode,
} from "@/modules/proposals/services/proposal-errors";
import { selectProposalAction } from "./proposal-selection.actions";

const PROJECT_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const PROPOSAL_ID = "8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SEEN = "2026-01-02T03:04:05.678Z";
const client = { id: "u-client", role: "client" };
const ERROR_CODES: ProposalErrorCode[] = [
  "PROJECT_NOT_OPEN",
  "ALREADY_PROPOSED",
  "RESEND_NOT_ALLOWED",
  "INVALID_STATE",
  "ALREADY_SELECTED",
  "PROPOSAL_CHANGED",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectProposal.mockReset();
  mocks.selectProposal.mockResolvedValue({
    projectId: PROJECT_ID,
    proposalId: PROPOSAL_ID,
    selectedAt: new Date(),
    alreadySelected: false,
  });
  mocks.requireRole.mockReset();
  mocks.requireRole.mockResolvedValue(client);
  mocks.enforceRateLimit.mockReset().mockResolvedValue({ ok: true });
});

describe("selectProposalAction rate limiting (spec 015)", () => {
  it("blocked limiter returns RATE_LIMITED without validating or calling the service", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "limited",
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(client, "proposal.select");
    expect(mocks.selectProposal).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allowed limiter keeps the normal flow", async () => {
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toEqual({ ok: true });
    expect(mocks.selectProposal).toHaveBeenCalled();
  });

  it("wrong role does not consume quota", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("selectProposalAction", () => {
  it("selects with the authenticated actor and the parsed input", async () => {
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toEqual({ ok: true });
    expect(mocks.requireRole).toHaveBeenCalledWith("client");
    expect(mocks.selectProposal).toHaveBeenCalledWith(client, {
      projectId: PROJECT_ID,
      proposalId: PROPOSAL_ID,
      seenUpdatedAt: new Date(SEEN),
    });
  });

  it("revalidates the six paths on success", async () => {
    await selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN);
    const paths = mocks.revalidatePath.mock.calls.map(([p]) => p).sort();
    expect(paths).toEqual(
      [
        `/projects/${PROJECT_ID}/proposals`,
        `/projects/${PROJECT_ID}`,
        `/projects/${PROJECT_ID}/edit`,
        "/dashboard/projects",
        "/dashboard/proposals",
        "/projects",
      ].sort(),
    );
  });

  it("treats the idempotent retry as success and revalidates", async () => {
    mocks.selectProposal.mockResolvedValue({
      projectId: PROJECT_ID,
      proposalId: PROPOSAL_ID,
      selectedAt: new Date(),
      alreadySelected: true,
    });
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(6);
  });

  it("never takes the actor from the input and does not redirect on success", async () => {
    await selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN);
    const [actor, input] = mocks.selectProposal.mock.calls[0];
    expect(actor).toBe(client);
    expect(Object.keys(input).sort()).toEqual(["projectId", "proposalId", "seenUpdatedAt"]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each([
    ["projectId", ["nope", PROPOSAL_ID, SEEN]],
    ["proposalId", [PROJECT_ID, "nope", SEEN]],
  ] as const)("returns NOT_FOUND for an invalid %s without calling the service", async (_n, args) => {
    const result = await selectProposalAction(...(args as [string, string, string]));
    expect(result).toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "No encontramos el proyecto o la propuesta.",
    });
    expect(mocks.selectProposal).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["", "yesterday", "2026-01-02", "12345"])(
    "returns PROPOSAL_CHANGED for an invalid version %j without calling the service",
    async (seen) => {
      const result = await selectProposalAction(PROJECT_ID, PROPOSAL_ID, seen);
      expect(result).toEqual({
        ok: false,
        code: "PROPOSAL_CHANGED",
        message: PROPOSAL_SELECTION_ERROR_MESSAGES.PROPOSAL_CHANGED,
      });
      expect(mocks.selectProposal).not.toHaveBeenCalled();
    },
  );

  it.each(ERROR_CODES)("maps ProposalError %s to the selection message", async (code) => {
    mocks.selectProposal.mockRejectedValue(new ProposalError(code));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toEqual({
      ok: false,
      code,
      message: PROPOSAL_SELECTION_ERROR_MESSAGES[code],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps AuthError NOT_FOUND inline", async () => {
    mocks.selectProposal.mockRejectedValue(new AuthError("NOT_FOUND"));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
      message: "No encontramos el proyecto o la propuesta.",
    });
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    mocks.selectProposal.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.selectProposal.mockRejectedValue(new Error("connection to neon failed: secret"));
    const result = await selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN);
    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "No pudimos completar la acción. Inténtalo de nuevo.",
    });
  });

  it("redirects to sign-in without session and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mocks.selectProposal).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user row is missing", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(selectProposalAction(PROJECT_ID, PROPOSAL_ID, SEEN)).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
    expect(mocks.selectProposal).not.toHaveBeenCalled();
  });

  it("404s on wrong role (admin/developer) before validating and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(selectProposalAction("bad", "bad", "bad")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.selectProposal).not.toHaveBeenCalled();
  });
});
