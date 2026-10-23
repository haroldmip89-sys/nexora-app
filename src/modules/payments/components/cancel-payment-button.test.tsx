import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cancelAction, refresh } = vi.hoisted(() => ({
  cancelAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/payments/actions/payment-cancellation.actions", () => ({
  cancelPendingPaymentAction: cancelAction,
}));

import { useAnnouncerStore } from "@/lib/announcer.store";
import { CancelPaymentButton } from "./cancel-payment-button";

async function confirmCancel() {
  const user = userEvent.setup();
  render(<CancelPaymentButton projectId="p1" />);
  await user.click(screen.getByRole("button", { name: "Cancelar pago de prueba" }));
  const buttons = await screen.findAllByRole("button", { name: "Cancelar pago de prueba" });
  await act(async () => {
    await user.click(buttons[buttons.length - 1]);
  });
}

describe("CancelPaymentButton announcements", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnouncerStore.setState({ message: "", kind: "status", id: 0 });
  });

  it.each([
    ["canceled", "Pago de prueba cancelado. Ya puedes reintentar el pago o cerrar el proyecto."],
    ["completed", "El pago se completó antes de poder cancelarlo. Ya está confirmado."],
    ["none", "No hay un pago pendiente que cancelar."],
  ])("announces %s as status", async (outcome, text) => {
    cancelAction.mockResolvedValue({ ok: true, outcome });
    await confirmCancel();
    const s = useAnnouncerStore.getState();
    expect(s.message).toBe(text);
    expect(s.kind).toBe("status");
    expect(refresh).toHaveBeenCalled();
  });

  it("announces action error as alert", async () => {
    cancelAction.mockResolvedValue({ ok: false, message: "No se pudo cancelar." });
    await confirmCancel();
    const s = useAnnouncerStore.getState();
    expect(s.message).toBe("No se pudo cancelar.");
    expect(s.kind).toBe("alert");
  });

  it("announces thrown error as alert", async () => {
    cancelAction.mockRejectedValue(new Error("boom"));
    await confirmCancel();
    const s = useAnnouncerStore.getState();
    expect(s.message).toBe("No pudimos completar la acción. Inténtalo de nuevo.");
    expect(s.kind).toBe("alert");
  });
});
