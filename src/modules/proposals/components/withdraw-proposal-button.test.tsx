import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnouncerStore } from "@/lib/announcer.store";

const withdrawMock = vi.fn();
vi.mock("@/modules/proposals/actions/proposal.actions", () => ({
  withdrawProposalAction: (...args: unknown[]) => withdrawMock(...args),
}));

import { WithdrawProposalButton } from "./withdraw-proposal-button";

describe("WithdrawProposalButton", () => {
  beforeEach(() => {
    withdrawMock.mockReset();
    useAnnouncerStore.setState({ message: "", id: 0 });
  });
  afterEach(cleanup);

  it("opens a dialog and does not run the action until confirmed", async () => {
    const user = userEvent.setup();
    render(<WithdrawProposalButton proposalId="p1" />);
    await user.click(screen.getByRole("button", { name: "Retirar" }));
    const dialog = await screen.findByRole("alertdialog", { name: "¿Retirar esta propuesta?" });
    expect(dialog).toHaveTextContent("No podrás enviar otra a este proyecto.");
    expect(withdrawMock).not.toHaveBeenCalled();
  });

  it("cancel does not run the action", async () => {
    const user = userEvent.setup();
    render(<WithdrawProposalButton proposalId="p1" />);
    await user.click(screen.getByRole("button", { name: "Retirar" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(withdrawMock).not.toHaveBeenCalled();
  });

  it("announces success after confirming", async () => {
    withdrawMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<WithdrawProposalButton proposalId="p1" />);
    await user.click(screen.getByRole("button", { name: "Retirar" }));
    await user.click(await screen.findByRole("button", { name: "Retirar propuesta" }));
    expect(withdrawMock).toHaveBeenCalledWith("p1");
    await vi.waitFor(() =>
      expect(useAnnouncerStore.getState().message).toBe("Propuesta retirada."),
    );
  });

  it("keeps the dialog open showing the error", async () => {
    withdrawMock.mockResolvedValue({ ok: false, code: "UNKNOWN", message: "Falló." });
    const user = userEvent.setup();
    render(<WithdrawProposalButton proposalId="p1" />);
    await user.click(screen.getByRole("button", { name: "Retirar" }));
    await user.click(await screen.findByRole("button", { name: "Retirar propuesta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falló.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });
});
