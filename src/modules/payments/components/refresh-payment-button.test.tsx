import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refreshAction, refresh } = vi.hoisted(() => ({
  refreshAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/payments/actions/payment-reconciliation.actions", () => ({
  refreshPaymentStatusAction: refreshAction,
}));

import { useAnnouncerStore } from "@/lib/announcer.store";
import { RefreshPaymentButton } from "./refresh-payment-button";

describe("RefreshPaymentButton", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnouncerStore.setState({ message: "", kind: "status", id: 0 });
  });

  it("renders the label enabled", () => {
    render(<RefreshPaymentButton projectId="p1" />);
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeEnabled();
  });

  it("disables the button while pending", async () => {
    let resolve!: (v: unknown) => void;
    refreshAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<RefreshPaymentButton projectId="p1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(refreshAction).toHaveBeenCalledWith("p1");
    expect(await screen.findByRole("button", { name: "Actualizando..." })).toBeDisabled();
    await act(async () => resolve({ ok: true, outcome: "none" }));
  });

  it.each([
    ["completed", "Pago de prueba confirmado por el servidor."],
    ["canceled", "El intento se cerró sin completarse."],
    ["unchanged", "Stripe todavía no confirma el pago."],
    ["none", "No hay un intento de pago para consultar."],
  ])("shows and announces %s as status and refreshes", async (outcome, text) => {
    refreshAction.mockResolvedValue({ ok: true, outcome });
    const user = userEvent.setup();
    render(<RefreshPaymentButton projectId="p1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    const s = useAnnouncerStore.getState();
    expect(s.message).toBe(text);
    expect(s.kind).toBe("status");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows and announces the action error as alert without refreshing", async () => {
    refreshAction.mockResolvedValue({ ok: false, code: "ANY", message: "No se pudo consultar." });
    const user = userEvent.setup();
    render(<RefreshPaymentButton projectId="p1" />);
    await user.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(await screen.findByText("No se pudo consultar.")).toBeInTheDocument();
    const s = useAnnouncerStore.getState();
    expect(s.message).toBe("No se pudo consultar.");
    expect(s.kind).toBe("alert");
    expect(refresh).not.toHaveBeenCalled();
  });
});
