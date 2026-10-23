import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./confirm-dialog";

type Extra = Partial<React.ComponentProps<typeof ConfirmDialog>>;

function Harness({ onConfirm = () => {}, onOpenChange, ...extra }: Extra) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={openerRef} type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        title="¿Seguro?"
        description="Descripción del diálogo."
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
        finalFocus={openerRef}
        {...extra}
      />
    </>
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Abrir" }));
  return screen.findByRole("alertdialog");
}

describe("ConfirmDialog", () => {
  afterEach(cleanup);

  it("opens as an alertdialog named by title and described by description, focusing Cancelar", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);
    expect(dialog).toHaveAccessibleName("¿Seguro?");
    expect(dialog).toHaveAccessibleDescription("Descripción del diálogo.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus());
  });

  it("traps focus with Tab and Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openDialog(user);
    for (let i = 0; i < 5; i++) {
      await user.tab();
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    }
    for (let i = 0; i < 5; i++) {
      await user.tab({ shift: true });
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    }
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus());
  });

  it("calls onConfirm once per click", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("while pending disables both buttons, shows pendingLabel and ignores Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness pending pendingLabel="Procesando..." onOpenChange={onOpenChange} />);
    await openDialog(user);
    expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("falls back to confirmLabel while pending without pendingLabel", async () => {
    const user = userEvent.setup();
    render(<Harness pending />);
    await openDialog(user);
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("renders error in a role=alert while open", async () => {
    const user = userEvent.setup();
    render(<Harness error="Algo falló" />);
    await openDialog(user);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo falló");
  });

  it("supports custom cancelLabel and destructive confirm", async () => {
    const user = userEvent.setup();
    render(<Harness cancelLabel="Volver" destructive />);
    await openDialog(user);
    expect(screen.getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
  });
});
