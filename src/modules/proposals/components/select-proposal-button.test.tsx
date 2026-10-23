import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnouncerStore } from "@/lib/announcer.store";

const selectMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/modules/proposals/actions/proposal-selection.actions", () => ({
  selectProposalAction: (...a: unknown[]) => selectMock(...a),
}));

import { SelectProposalButton } from "./select-proposal-button";

async function openAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  render(
    <SelectProposalButton
      projectId="pr"
      proposalId="pp"
      developerName="Ana"
      seenUpdatedAt="2026-01-01T00:00:00.000Z"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Seleccionar esta propuesta" }));
  await user.click(await screen.findByRole("button", { name: "Confirmar selección" }));
}

describe("SelectProposalButton", () => {
  beforeEach(() => {
    selectMock.mockReset();
    refreshMock.mockReset();
    useAnnouncerStore.setState({ message: "", id: 0 });
  });
  afterEach(cleanup);

  it("stale error keeps the dialog open without refreshing until closed", async () => {
    selectMock.mockResolvedValue({ ok: false, code: "PROPOSAL_CHANGED", message: "Cambió." });
    const user = userEvent.setup();
    await openAndConfirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cambió.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar selección" })).toBeDisabled();
    expect(refreshMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cerrar y recargar" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("Escape while stale also refreshes", async () => {
    selectMock.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Ya no existe." });
    const user = userEvent.setup();
    await openAndConfirm(user);
    await screen.findByRole("alert");
    await user.keyboard("{Escape}");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("non-stale error shows the message and does not refresh", async () => {
    selectMock.mockResolvedValue({ ok: false, code: "UNKNOWN", message: "Error." });
    const user = userEvent.setup();
    await openAndConfirm(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Error.");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirmar selección" })).toBeEnabled();
  });

  it("success closes and announces", async () => {
    selectMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await openAndConfirm(user);
    await vi.waitFor(() =>
      expect(useAnnouncerStore.getState().message).toBe(
        "Propuesta seleccionada. Continúa con el pago de prueba.",
      ),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
