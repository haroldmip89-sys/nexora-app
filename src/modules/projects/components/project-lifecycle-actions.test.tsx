import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAnnouncerStore } from "@/lib/announcer.store";

const publishMock = vi.fn();
const unpublishMock = vi.fn();
const closeMock = vi.fn();
vi.mock("@/modules/projects/actions/project.actions", () => ({
  publishProjectAction: (...a: unknown[]) => publishMock(...a),
  unpublishProjectAction: (...a: unknown[]) => unpublishMock(...a),
  closeProjectAction: (...a: unknown[]) => closeMock(...a),
}));

import { ProjectLifecycleActions } from "./project-lifecycle-actions";

describe("ProjectLifecycleActions", () => {
  beforeEach(() => {
    [publishMock, unpublishMock, closeMock].forEach((m) => m.mockReset());
    useAnnouncerStore.setState({ message: "", id: 0 });
  });
  afterEach(cleanup);

  it("publish runs without confirmation and announces", async () => {
    publishMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ProjectLifecycleActions projectId="x" status="draft" proposalCount={0} />);
    await user.click(screen.getByRole("button", { name: "Publicar" }));
    expect(publishMock).toHaveBeenCalledWith("x");
    await vi.waitFor(() =>
      expect(useAnnouncerStore.getState().message).toBe("Proyecto publicado."),
    );
  });

  it("unpublish opens a dialog, needs confirmation, then announces", async () => {
    unpublishMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ProjectLifecycleActions projectId="x" status="published" proposalCount={0} />);
    await user.click(screen.getByRole("button", { name: "Despublicar" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "¿Despublicar este proyecto?",
    });
    expect(dialog).toHaveTextContent("Volverá a ser un borrador y dejará de ser visible.");
    expect(unpublishMock).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Despublicar" }).at(-1)!);
    expect(unpublishMock).toHaveBeenCalledWith("x");
    await vi.waitFor(() =>
      expect(useAnnouncerStore.getState().message).toBe("Proyecto despublicado."),
    );
  });

  it("cancel does not run the close action", async () => {
    const user = userEvent.setup();
    render(<ProjectLifecycleActions projectId="x" status="published" proposalCount={2} />);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await screen.findByRole("alertdialog", { name: "¿Cerrar este proyecto?" });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(closeMock).not.toHaveBeenCalled();
  });

  it("close confirms and announces", async () => {
    closeMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ProjectLifecycleActions projectId="x" status="published" proposalCount={2} />);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(await screen.findByRole("button", { name: "Cerrar proyecto" }));
    expect(closeMock).toHaveBeenCalledWith("x");
    await vi.waitFor(() =>
      expect(useAnnouncerStore.getState().message).toBe("Proyecto cerrado."),
    );
  });

  it("shows the error inside the dialog and keeps it open", async () => {
    closeMock.mockResolvedValue({ ok: false, code: "UNKNOWN", message: "No se pudo." });
    const user = userEvent.setup();
    render(<ProjectLifecycleActions projectId="x" status="published" proposalCount={2} />);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(await screen.findByRole("button", { name: "Cerrar proyecto" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });
});
