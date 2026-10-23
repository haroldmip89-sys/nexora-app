// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  createProposal: vi.fn(),
  updateProposal: vi.fn(),
  withdrawProposal: vi.fn(),
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
vi.mock("@/modules/proposals/services/proposal.service", () => ({
  createProposal: mocks.createProposal,
  updateProposal: mocks.updateProposal,
  withdrawProposal: mocks.withdrawProposal,
}));
vi.mock("@/modules/security/services/rate-limit.service", () => ({
  RATE_LIMITED_MESSAGE: "limited",
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  PROPOSAL_ERROR_MESSAGES,
  ProposalError,
  type ProposalErrorCode,
} from "@/modules/proposals/services/proposal-errors";
import {
  createProposalAction,
  updateProposalAction,
  withdrawProposalAction,
} from "./proposal.actions";

const PROJECT_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const PROPOSAL_ID = "8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const developer = { id: "u-dev", role: "developer" };
const ERROR_CODES: ProposalErrorCode[] = [
  "PROJECT_NOT_OPEN",
  "ALREADY_PROPOSED",
  "RESEND_NOT_ALLOWED",
  "INVALID_STATE",
];

function validForm(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    priceUsd: "1500.50",
    timelineWeeks: "8",
    description: "Puedo construir la tienda completa con catálogo, carrito y pagos.",
    ...extra,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const idle = { status: "idle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createProposal.mockReset();
  mocks.createProposal.mockResolvedValue({ id: PROPOSAL_ID, projectId: PROJECT_ID });
  mocks.updateProposal.mockReset();
  mocks.updateProposal.mockResolvedValue({ id: PROPOSAL_ID, projectId: PROJECT_ID });
  mocks.withdrawProposal.mockReset();
  mocks.withdrawProposal.mockResolvedValue({ id: PROPOSAL_ID, projectId: PROJECT_ID });
  mocks.requireRole.mockResolvedValue(developer);
  mocks.enforceRateLimit.mockReset().mockResolvedValue({ ok: true });
});

describe("createProposalAction", () => {
  it("creates, revalidates all paths and returns success", async () => {
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).resolves.toEqual({
      status: "success",
    });
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.createProposal).toHaveBeenCalledWith(developer, PROJECT_ID, {
      priceCents: 150050,
      timelineWeeks: 8,
      description: "Puedo construir la tienda completa con catálogo, carrito y pagos.",
    });
    for (const path of [
      "/dashboard/proposals",
      `/projects/${PROJECT_ID}`,
      `/projects/${PROJECT_ID}/proposals`,
      "/dashboard/projects",
      `/projects/${PROJECT_ID}/edit`,
    ]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("never takes actor, status, developerId or projectId from the input", async () => {
    const fd = validForm({
      developerId: "attacker",
      status: "accepted",
      projectId: "other",
      id: "x",
      actor: "admin",
    });
    await createProposalAction(PROJECT_ID, idle, fd);
    const [actor, projectId, data] = mocks.createProposal.mock.calls[0];
    expect(actor).toBe(developer);
    expect(projectId).toBe(PROJECT_ID);
    expect(Object.keys(data).sort()).toEqual(["description", "priceCents", "timelineWeeks"]);
  });

  it("returns fieldErrors and values on invalid input without calling the service", async () => {
    const state = await createProposalAction(
      PROJECT_ID,
      idle,
      validForm({ priceUsd: "10.999", timelineWeeks: "0", description: "corta" }),
    );
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.fieldErrors.priceUsd).toBeTruthy();
    expect(state.fieldErrors.timelineWeeks).toBeTruthy();
    expect(state.fieldErrors.description).toBeTruthy();
    expect(state.values).toEqual({ priceUsd: "10.999", timelineWeeks: "0", description: "corta" });
    expect(mocks.createProposal).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ERROR_CODES)("maps ProposalError %s to its Spanish message", async (code) => {
    mocks.createProposal.mockRejectedValue(new ProposalError(code));
    const state = await createProposalAction(PROJECT_ID, idle, validForm());
    expect(state).toMatchObject({ status: "error", message: PROPOSAL_ERROR_MESSAGES[code] });
    if (state.status === "error") expect(state.values.priceUsd).toBe("1500.50");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns an inline not-found state for AuthError NOT_FOUND", async () => {
    mocks.createProposal.mockRejectedValue(new AuthError("NOT_FOUND"));
    const state = await createProposalAction(PROJECT_ID, idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("delegates other AuthErrors from the service to the page handler", async () => {
    mocks.createProposal.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("returns a not-found state for a non-UUID projectId without touching the service", async () => {
    const state = await createProposalAction("not-a-uuid", idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.createProposal.mockRejectedValue(new Error("connection to neon failed: secret"));
    const state = await createProposalAction(PROJECT_ID, idle, validForm());
    expect(state.status).toBe("error");
    expect(state.status === "error" && state.message).not.toContain("neon");
  });

  it("redirects to sign-in without session and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user row is missing", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("404s on wrong role before validating and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(
      createProposalAction(PROJECT_ID, idle, validForm({ priceUsd: "bad" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });
});

describe("updateProposalAction", () => {
  it("updates and revalidates the paths using the projectId of the returned row", async () => {
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).resolves.toEqual({
      status: "success",
    });
    expect(mocks.updateProposal).toHaveBeenCalledWith(
      developer,
      PROPOSAL_ID,
      expect.objectContaining({ priceCents: 150050, timelineWeeks: 8 }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/proposals");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/proposals`);
  });

  it("ignores status, developerId and projectId from the input", async () => {
    await updateProposalAction(
      PROPOSAL_ID,
      idle,
      validForm({ status: "accepted", developerId: "x", projectId: "y" }),
    );
    const [actor, , data] = mocks.updateProposal.mock.calls[0];
    expect(actor).toBe(developer);
    expect(Object.keys(data).sort()).toEqual(["description", "priceCents", "timelineWeeks"]);
  });

  it("returns fieldErrors and values on invalid input without calling the service", async () => {
    const state = await updateProposalAction(PROPOSAL_ID, idle, validForm({ priceUsd: "-1" }));
    expect(state.status === "error" && state.fieldErrors.priceUsd).toBeTruthy();
    expect(state.status === "error" && state.values.priceUsd).toBe("-1");
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });

  it.each(ERROR_CODES)("maps ProposalError %s", async (code) => {
    mocks.updateProposal.mockRejectedValue(new ProposalError(code));
    const state = await updateProposalAction(PROPOSAL_ID, idle, validForm());
    expect(state).toMatchObject({ status: "error", message: PROPOSAL_ERROR_MESSAGES[code] });
  });

  it("returns a not-found state for a foreign proposal (AuthError NOT_FOUND)", async () => {
    mocks.updateProposal.mockRejectedValue(new AuthError("NOT_FOUND"));
    const state = await updateProposalAction(PROPOSAL_ID, idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a not-found state for a non-UUID id without touching the service", async () => {
    const state = await updateProposalAction("nope", idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors", async () => {
    mocks.updateProposal.mockRejectedValue(new Error("db down"));
    const state = await updateProposalAction(PROPOSAL_ID, idle, validForm());
    expect(state.status === "error" && state.message).not.toContain("db");
  });

  it("requires auth before anything else", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });

  it("redirects to onboarding and 404s on wrong role", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });
});

describe("rate limiting (spec 015)", () => {
  const limited = { ok: false, retryAfterSeconds: 30 };

  it("create/update: blocked limiter skips the service and returns a form error", async () => {
    mocks.enforceRateLimit.mockResolvedValue(limited);
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).resolves.toMatchObject({
      status: "error",
      message: "limited",
    });
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).resolves.toMatchObject({
      status: "error",
      message: "limited",
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(developer, "proposal.write");
    expect(mocks.createProposal).not.toHaveBeenCalled();
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });

  it("withdraw: blocked limiter returns RATE_LIMITED without the service", async () => {
    mocks.enforceRateLimit.mockResolvedValue(limited);
    await expect(withdrawProposalAction(PROPOSAL_ID)).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "limited",
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(developer, "proposal.write");
    expect(mocks.withdrawProposal).not.toHaveBeenCalled();
  });

  it("allowed limiter keeps the normal flow", async () => {
    await expect(withdrawProposalAction(PROPOSAL_ID)).resolves.toEqual({ ok: true });
    expect(mocks.withdrawProposal).toHaveBeenCalledWith(developer, PROPOSAL_ID);
  });

  it("wrong role does not consume quota", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(createProposalAction(PROJECT_ID, idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(updateProposalAction(PROPOSAL_ID, idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(withdrawProposalAction(PROPOSAL_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("withdrawProposalAction", () => {
  it("delegates with the server-side actor and revalidates all paths", async () => {
    await expect(withdrawProposalAction(PROPOSAL_ID)).resolves.toEqual({ ok: true });
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.withdrawProposal).toHaveBeenCalledWith(developer, PROPOSAL_ID);
    for (const path of [
      "/dashboard/proposals",
      `/projects/${PROJECT_ID}`,
      `/projects/${PROJECT_ID}/proposals`,
      "/dashboard/projects",
      `/projects/${PROJECT_ID}/edit`,
    ]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("returns NOT_FOUND for a non-UUID id without calling the service", async () => {
    await expect(withdrawProposalAction("nope")).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(mocks.withdrawProposal).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a foreign proposal (AuthError NOT_FOUND)", async () => {
    mocks.withdrawProposal.mockRejectedValue(new AuthError("NOT_FOUND"));
    await expect(withdrawProposalAction(PROPOSAL_ID)).resolves.toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it.each(ERROR_CODES)("translates ProposalError %s to code and message", async (code) => {
    mocks.withdrawProposal.mockRejectedValue(new ProposalError(code));
    await expect(withdrawProposalAction(PROPOSAL_ID)).resolves.toEqual({
      ok: false,
      code,
      message: PROPOSAL_ERROR_MESSAGES[code],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN with a generic message on unexpected errors", async () => {
    mocks.withdrawProposal.mockRejectedValue(new Error("db down"));
    const result = await withdrawProposalAction(PROPOSAL_ID);
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN" });
    expect(result.ok === false && result.message).not.toContain("db");
  });

  it("redirects to sign-in / onboarding and 404s on wrong role, skipping the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(withdrawProposalAction(PROPOSAL_ID)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(withdrawProposalAction(PROPOSAL_ID)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(withdrawProposalAction(PROPOSAL_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.withdrawProposal).not.toHaveBeenCalled();
  });
});
