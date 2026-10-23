import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startAction, refresh } = vi.hoisted(() => ({
  startAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/payments/actions/payment.actions", () => ({
  startCheckoutAction: startAction,
}));

import { StartCheckoutButton } from "./start-checkout-button";

describe("StartCheckoutButton", () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it("renders the given label enabled", () => {
    render(<StartCheckoutButton projectId="p1" label="Pagar ahora" />);
    expect(screen.getByRole("button", { name: "Pagar ahora" })).toBeEnabled();
  });

  it("disables the button while pending", async () => {
    let resolve!: (v: undefined) => void;
    startAction.mockReturnValue(new Promise<undefined>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<StartCheckoutButton projectId="p1" label="Pagar ahora" />);
    await user.click(screen.getByRole("button", { name: "Pagar ahora" }));
    expect(startAction).toHaveBeenCalledWith("p1");
    const pending = await screen.findByRole("button", { name: "Redirigiendo a Stripe..." });
    expect(pending).toBeDisabled();
    await act(async () => resolve(undefined));
  });

  it("shows no error and does not refresh when the action redirects (undefined)", async () => {
    startAction.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StartCheckoutButton projectId="p1" label="Pagar ahora" />);
    await user.click(screen.getByRole("button", { name: "Pagar ahora" }));
    expect(await screen.findByRole("button", { name: "Pagar ahora" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each(["PAYMENT_NOT_ALLOWED", "PAYMENT_ALREADY_ACTIVE", "NOT_FOUND"])(
    "shows the error and refreshes on stale code %s",
    async (code) => {
      startAction.mockResolvedValue({ ok: false, code, message: "Dato desactualizado." });
      const user = userEvent.setup();
      render(<StartCheckoutButton projectId="p1" label="Pagar ahora" />);
      await user.click(screen.getByRole("button", { name: "Pagar ahora" }));
      expect((await screen.findByRole("alert")).textContent).toBe("Dato desactualizado.");
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it("shows the error without refreshing on a non-stale code", async () => {
    startAction.mockResolvedValue({ ok: false, code: "STRIPE_ERROR", message: "Falló Stripe." });
    const user = userEvent.setup();
    render(<StartCheckoutButton projectId="p1" label="Pagar ahora" />);
    await user.click(screen.getByRole("button", { name: "Pagar ahora" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Falló Stripe.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
