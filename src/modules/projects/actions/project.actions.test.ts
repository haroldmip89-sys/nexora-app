// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  publishProject: vi.fn(),
  unpublishProject: vi.fn(),
  closeProject: vi.fn(),
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
vi.mock("@/modules/projects/services/project.service", () => ({
  createProject: mocks.createProject,
  updateProject: mocks.updateProject,
  publishProject: mocks.publishProject,
  unpublishProject: mocks.unpublishProject,
  closeProject: mocks.closeProject,
}));
vi.mock("@/modules/security/services/rate-limit.service", () => ({
  RATE_LIMITED_MESSAGE: "limited",
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import { ProjectError } from "@/modules/projects/services/project-errors";
import {
  closeProjectAction,
  createProjectAction,
  publishProjectAction,
  unpublishProjectAction,
  updateProjectAction,
} from "./project.actions";

const ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const client = { id: "u-client", role: "client" };
const admin = { id: "u-admin", role: "admin" };

function validForm(extra: Record<string, string> = {}, tags: string[] = ["react", "nodejs"]): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    title: "Tienda en línea",
    category: "E-commerce",
    description: "Necesito una tienda en línea completa con catálogo y carrito.",
    budgetMinUsd: "1000",
    budgetMaxUsd: "1500.50",
    timelineWeeks: "8",
    ...extra,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  for (const tag of tags) fd.append("technologies", tag);
  return fd;
}

const idle = { status: "idle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [
    mocks.createProject,
    mocks.updateProject,
    mocks.publishProject,
    mocks.unpublishProject,
    mocks.closeProject,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
  mocks.requireRole.mockResolvedValue(client);
  mocks.enforceRateLimit.mockReset().mockResolvedValue({ ok: true });
});

describe("createProjectAction", () => {
  it("creates a draft, revalidates and redirects", async () => {
    await expect(createProjectAction(idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/projects",
    );
    expect(mocks.requireRole).toHaveBeenCalledWith("client");
    expect(mocks.createProject).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        budgetMinCents: 100000,
        budgetMaxCents: 150050,
        technologies: ["react", "nodejs"],
      }),
      { publish: false },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects");
  });

  it("publishes when intent is publish", async () => {
    await expect(createProjectAction(idle, validForm({ intent: "publish" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.createProject).toHaveBeenCalledWith(client, expect.anything(), { publish: true });
  });

  it("never takes actor, status or clientId from the input", async () => {
    const fd = validForm({ clientId: "attacker", status: "closed", id: "x" });
    await expect(createProjectAction(idle, fd)).rejects.toThrow("NEXT_REDIRECT");
    const [actor, data] = mocks.createProject.mock.calls[0];
    expect(actor).toBe(client);
    expect(data).not.toHaveProperty("clientId");
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("id");
  });

  it("returns fieldErrors and values on invalid input without calling the service", async () => {
    const state = await createProjectAction(idle, validForm({ title: "x", budgetMinUsd: "abc" }));
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.fieldErrors.title).toBeTruthy();
    expect(state.fieldErrors.budgetMinUsd).toBeTruthy();
    expect(state.values.title).toBe("x");
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns technologies as an array in values on validation errors", async () => {
    const state = await createProjectAction(idle, validForm({ title: "x" }, ["react", "C#"]));
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.values.technologies).toEqual(["react", "C#"]);
    expect(state.fieldErrors.technologies).toBeTruthy();
  });

  it("reports a missing tag selection as a technologies field error", async () => {
    const state = await createProjectAction(idle, validForm({}, []));
    expect(state.status === "error" && state.fieldErrors.technologies).toBe("Indica al menos una tecnología");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("maps INVALID_TECHNOLOGY to a technologies field error keeping the submitted tags", async () => {
    mocks.createProject.mockRejectedValue(new ProjectError("INVALID_TECHNOLOGY"));
    const state = await createProjectAction(idle, validForm());
    expect(state.status).toBe("error");
    if (state.status !== "error") return;
    expect(state.fieldErrors.technologies).toBe("Selecciona tecnologías de la lista.");
    expect(state.values.technologies).toEqual(["react", "nodejs"]);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps ProjectError to a Spanish message", async () => {
    mocks.createProject.mockRejectedValue(new ProjectError("INVALID_PROJECT"));
    const state = await createProjectAction(idle, validForm());
    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.message).toMatch(/requisitos/);
      expect(state.values.title).toBe("Tienda en línea");
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.createProject.mockRejectedValue(new Error("connection to neon failed: secret"));
    const state = await createProjectAction(idle, validForm());
    expect(state.status === "error" && state.message).not.toContain("neon");
    expect(state.status).toBe("error");
  });

  it("redirects to sign-in without session and does not call the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(createProjectAction(idle, validForm())).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user row is missing", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(createProjectAction(idle, validForm())).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  });

  it("404s on wrong role and does not validate or call the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(createProjectAction(idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});

describe("updateProjectAction", () => {
  it("updates, revalidates both paths and redirects", async () => {
    await expect(updateProjectAction(ID, idle, validForm())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/projects",
    );
    expect(mocks.updateProject).toHaveBeenCalledWith(client, ID, expect.anything());
    expect(mocks.publishProject).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${ID}/edit`);
  });

  it("updates then publishes on intent publish", async () => {
    await expect(updateProjectAction(ID, idle, validForm({ intent: "publish" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.updateProject).toHaveBeenCalled();
    expect(mocks.publishProject).toHaveBeenCalledWith(client, ID);
  });

  it("reports a publish failure as form error (changes stay saved)", async () => {
    mocks.publishProject.mockRejectedValue(new ProjectError("INVALID_PROJECT"));
    const state = await updateProjectAction(ID, idle, validForm({ intent: "publish" }));
    expect(state.status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps LOCKED_FIELDS to a message", async () => {
    mocks.updateProject.mockRejectedValue(new ProjectError("LOCKED_FIELDS"));
    const state = await updateProjectAction(ID, idle, validForm());
    expect(state.status === "error" && state.message).toMatch(/título/);
  });

  it("returns a not-found state for a non-owner (AuthError NOT_FOUND)", async () => {
    mocks.updateProject.mockRejectedValue(new AuthError("NOT_FOUND"));
    const state = await updateProjectAction(ID, idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a not-found state for a non-UUID id without touching the service", async () => {
    const state = await updateProjectAction("not-a-uuid", idle, validForm());
    expect(state.status).toBe("error");
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("returns fieldErrors on invalid input without calling the service", async () => {
    const state = await updateProjectAction(ID, idle, validForm({ timelineWeeks: "0" }));
    expect(state.status === "error" && state.fieldErrors.timelineWeeks).toBeTruthy();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("requires auth before anything else", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(updateProjectAction(ID, idle, validForm())).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("404s on wrong role", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(updateProjectAction(ID, idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe.each([
  ["publishProjectAction", publishProjectAction, "publishProject", ["client"]],
  ["unpublishProjectAction", unpublishProjectAction, "unpublishProject", ["client"]],
  ["closeProjectAction", closeProjectAction, "closeProject", ["client", "admin"]],
] as const)("%s", (_name, action, serviceFn, roles) => {
  it("delegates with the server-side actor and revalidates", async () => {
    await expect(action(ID)).resolves.toEqual({ ok: true });
    expect(mocks.requireRole).toHaveBeenCalledWith(...roles);
    expect(mocks[serviceFn]).toHaveBeenCalledWith(client, ID);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/projects");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${ID}/edit`);
  });

  it("returns NOT_FOUND for a non-UUID id without calling the service", async () => {
    const result = await action("nope");
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks[serviceFn]).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for a foreign project (AuthError NOT_FOUND)", async () => {
    mocks[serviceFn].mockRejectedValue(new AuthError("NOT_FOUND"));
    await expect(action(ID)).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("translates ProjectError to code and Spanish message", async () => {
    mocks[serviceFn].mockRejectedValue(new ProjectError("INVALID_STATE"));
    const result = await action(ID);
    expect(result).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(result.ok === false && result.message).toMatch(/estado/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN with a generic message on unexpected errors", async () => {
    mocks[serviceFn].mockRejectedValue(new Error("db down"));
    const result = await action(ID);
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN" });
    expect(result.ok === false && result.message).not.toContain("db");
  });

  it("redirects to sign-in without session and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(action(ID)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks[serviceFn]).not.toHaveBeenCalled();
  });

  it("404s on wrong role", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(action(ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks[serviceFn]).not.toHaveBeenCalled();
  });
});

describe("rate limiting (spec 015)", () => {
  const limited = { ok: false, retryAfterSeconds: 30 };
  const lifecycle = [
    ["publishProjectAction", publishProjectAction, mocks.publishProject],
    ["unpublishProjectAction", unpublishProjectAction, mocks.unpublishProject],
    ["closeProjectAction", closeProjectAction, mocks.closeProject],
  ] as const;

  it("createProjectAction: blocked limiter skips the service and returns a form error", async () => {
    mocks.enforceRateLimit.mockResolvedValue(limited);
    const state = await createProjectAction(idle, validForm());
    expect(state).toMatchObject({ status: "error", message: "limited" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(client, "project.write");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("updateProjectAction: blocked limiter skips the service and returns a form error", async () => {
    mocks.enforceRateLimit.mockResolvedValue(limited);
    const state = await updateProjectAction(ID, idle, validForm());
    expect(state).toMatchObject({ status: "error", message: "limited" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(client, "project.write");
    expect(mocks.updateProject).not.toHaveBeenCalled();
    expect(mocks.publishProject).not.toHaveBeenCalled();
  });

  it.each(lifecycle)("%s: blocked limiter returns RATE_LIMITED without the service", async (_n, action, service) => {
    mocks.enforceRateLimit.mockResolvedValue(limited);
    await expect(action(ID)).resolves.toEqual({ ok: false, code: "RATE_LIMITED", message: "limited" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(client, "project.write");
    expect(service).not.toHaveBeenCalled();
  });

  it.each(lifecycle)("%s: allowed limiter keeps the normal flow", async (_n, action, service) => {
    await expect(action(ID)).resolves.toEqual({ ok: true });
    expect(service).toHaveBeenCalledWith(client, ID);
  });

  it("wrong role does not consume quota", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(createProjectAction(idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(updateProjectAction(ID, idle, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(publishProjectAction(ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("closeProjectAction with admin", () => {
  it("lets an admin close and passes the admin actor", async () => {
    mocks.requireRole.mockResolvedValue(admin);
    await expect(closeProjectAction(ID)).resolves.toEqual({ ok: true });
    expect(mocks.closeProject).toHaveBeenCalledWith(admin, ID);
  });

  it("maps PAYMENT_IN_PROGRESS", async () => {
    mocks.closeProject.mockRejectedValue(new ProjectError("PAYMENT_IN_PROGRESS"));
    await expect(closeProjectAction(ID)).resolves.toMatchObject({
      ok: false,
      code: "PAYMENT_IN_PROGRESS",
    });
  });
});

describe("unpublishProjectAction", () => {
  it("maps HAS_PROPOSALS", async () => {
    mocks.unpublishProject.mockRejectedValue(new ProjectError("HAS_PROPOSALS"));
    await expect(unpublishProjectAction(ID)).resolves.toMatchObject({
      ok: false,
      code: "HAS_PROPOSALS",
    });
  });
});
