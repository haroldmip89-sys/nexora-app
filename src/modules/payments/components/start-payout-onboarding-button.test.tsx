import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startAction, refresh } = vi.hoisted(() => ({
  startAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/payments/actions/connected-account.actions", () => ({
  startPayoutOnboardingAction: startAction,
}));

import { StartPayoutOnboardingButton } from "./start-payout-onboarding-button";

describe("StartPayoutOnboardingButton", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("renders the given label enabled", () => {
    render(<StartPayoutOnboardingButton label="Configurar cobros" />);
    expect(screen.getByRole("button", { name: "Configurar cobros" })).toBeEnabled();
  });

  it("disables the button while pending", async () => {
    let resolve!: (v: undefined) => void;
    startAction.mockReturnValue(new Promise<undefined>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<StartPayoutOnboardingButton label="Configurar cobros" />);
    await user.click(screen.getByRole("button", { name: "Configurar cobros" }));
    const pending = await screen.findByRole("button", { name: "Redirigiendo a Stripe..." });
    expect(pending).toBeDisabled();
    await act(async () => resolve(undefined));
  });

  it("shows no error and does not refresh when the action redirects (undefined)", async () => {
    startAction.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StartPayoutOnboardingButton label="Configurar cobros" />);
    await user.click(screen.getByRole("button", { name: "Configurar cobros" }));
    expect(await screen.findByRole("button", { name: "Configurar cobros" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the error and always refreshes on failure", async () => {
    startAction.mockResolvedValue({ ok: false, code: "ANY", message: "No se pudo iniciar." });
    const user = userEvent.setup();
    render(<StartPayoutOnboardingButton label="Configurar cobros" />);
    await user.click(screen.getByRole("button", { name: "Configurar cobros" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No se pudo iniciar.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
