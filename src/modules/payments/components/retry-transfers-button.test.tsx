import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { doAction, refresh } = vi.hoisted(() => ({
  doAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/modules/payments/actions/developer-transfer.actions", () => ({
  retryTransfersAction: doAction,
}));

import { useAnnouncerStore } from "@/lib/announcer.store";
import { RetryTransfersButton } from "./retry-transfers-button";

describe("RetryTransfersButton", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    useAnnouncerStore.setState({ message: "", kind: "status", id: 0 });
  });

  it("renders the label enabled", () => {
    render(<RetryTransfersButton />);
    expect(screen.getByRole("button", { name: "Reintentar transferencia" })).toBeEnabled();
  });

  it("disables the button while pending", async () => {
    let resolve!: (v: unknown) => void;
    doAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<RetryTransfersButton />);
    await user.click(screen.getByRole("button", { name: "Reintentar transferencia" }));
    expect(await screen.findByRole("button", { name: "Reintentando..." })).toBeDisabled();
    await act(async () => resolve({ ok: true }));
  });

  it("announces success and refreshes", async () => {
    doAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<RetryTransfersButton />);
    await user.click(screen.getByRole("button", { name: "Reintentar transferencia" }));
    expect(await screen.findByRole("button", { name: "Reintentar transferencia" })).toBeEnabled();
    expect(useAnnouncerStore.getState().message).toBe(
      "Transferencias reintentadas. Revisa el estado actualizado.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the error with role alert and does not refresh", async () => {
    doAction.mockResolvedValue({ ok: false, code: "ANY", message: "Algo falló." });
    const user = userEvent.setup();
    render(<RetryTransfersButton />);
    await user.click(screen.getByRole("button", { name: "Reintentar transferencia" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Algo falló.");
    expect(refresh).not.toHaveBeenCalled();
    expect(useAnnouncerStore.getState().message).toBe("");
  });
});
