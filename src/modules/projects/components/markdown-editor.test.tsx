import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownEditor } from "./markdown-editor";

afterEach(cleanup);

function setup(props: Partial<Parameters<typeof MarkdownEditor>[0]> = {}) {
  return render(
    <form aria-label="f">
      <label htmlFor="d">Descripción</label>
      <MarkdownEditor
        id="d"
        name="description"
        defaultValue=""
        maxLength={5000}
        minLength={30}
        {...props}
      />
    </form>,
  );
}

const formValue = () =>
  new FormData(screen.getByRole("form", { name: "f" }) as HTMLFormElement).get("description");

describe("MarkdownEditor", () => {
  it("toggles tabs with aria-pressed", async () => {
    const user = userEvent.setup();
    setup();
    const write = screen.getByRole("button", { name: "Escribir" });
    const preview = screen.getByRole("button", { name: "Vista previa" });
    expect(write).toHaveAttribute("aria-pressed", "true");
    expect(preview).toHaveAttribute("aria-pressed", "false");
    await user.click(preview);
    expect(write).toHaveAttribute("aria-pressed", "false");
    expect(preview).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("keeps the value in FormData across tabs", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Descripción"), "Hola mundo");
    await user.click(screen.getByRole("button", { name: "Vista previa" }));
    expect(formValue()).toBe("Hola mundo");
    await user.click(screen.getByRole("button", { name: "Escribir" }));
    expect(screen.getByLabelText("Descripción")).toHaveValue("Hola mundo");
  });

  it("shows the counter", async () => {
    const user = userEvent.setup();
    setup({ defaultValue: "abc" });
    expect(screen.getByText("3 / 5000 caracteres")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Descripción"), "de");
    expect(screen.getByText("5 / 5000 caracteres")).toBeInTheDocument();
  });

  it("renders the preview and shows an empty state", async () => {
    const user = userEvent.setup();
    const { container } = setup({ defaultValue: "## Título\n\n**fuerte**" });
    await user.click(screen.getByRole("button", { name: "Vista previa" }));
    expect(screen.getByRole("heading", { level: 2, name: "Título" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("fuerte");

    await user.click(screen.getByRole("button", { name: "Escribir" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.click(screen.getByRole("button", { name: "Vista previa" }));
    expect(screen.getByText("Nada que previsualizar")).toBeInTheDocument();
  });

  it("does not create elements from raw HTML in the preview", async () => {
    const user = userEvent.setup();
    const { container } = setup({
      defaultValue: "<script>alert(1)</script><img src=x onerror=alert(1)>",
    });
    await user.click(screen.getByRole("button", { name: "Vista previa" }));
    expect(
      container.querySelector("script, img, iframe, style, [onerror], [onclick]"),
    ).toBeNull();
  });

  it("applies toolbar formatting to the selection", async () => {
    const user = userEvent.setup();
    setup({ defaultValue: "hola" });
    const textarea = screen.getByLabelText("Descripción") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    await user.click(screen.getByRole("button", { name: "Negrita" }));
    expect(textarea).toHaveValue("**hola**");
    expect(formValue()).toBe("**hola**");
  });

  it("is read-only and disables the toolbar", () => {
    setup({ readOnly: true, defaultValue: "x" });
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("readonly");
    for (const name of ["Título", "Negrita", "Cursiva", "Lista", "Lista de tareas", "Enlace", "Código", "Tabla"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("offers no image or attachment control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /imagen|adjunt|archivo/i })).toBeNull();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
});
