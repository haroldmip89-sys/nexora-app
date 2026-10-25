import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProposalCta } from "@/modules/projects/components/proposal-cta";
import type { PublicViewer } from "@/modules/projects/types/public-project.types";

function renderCta(viewer: PublicViewer) {
  return render(<ProposalCta projectId="p1" viewer={viewer} />);
}

describe("ProposalCta", () => {
  afterEach(cleanup);

  it("links developers to the proposal section", () => {
    renderCta({ kind: "user", role: "developer", isOwner: false });
    expect(screen.getByRole("link", { name: "Ir a la propuesta" })).toHaveAttribute(
      "href",
      "#propuesta",
    );
  });

  it("shows sign in and sign up to visitors", () => {
    renderCta({ kind: "visitor" });
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir a la propuesta" })).toBeNull();
  });

  it("shows onboarding to users without a row", () => {
    renderCta({ kind: "needs_onboarding" });
    expect(screen.getByRole("link", { name: "Completar registro" })).toBeInTheDocument();
  });

  it("shows edit actions to the owner client", () => {
    renderCta({ kind: "user", role: "client", isOwner: true });
    expect(screen.getByRole("link", { name: "Editar proyecto" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis proyectos" })).toBeInTheDocument();
  });

  it("shows only a note to other clients", () => {
    renderCta({ kind: "user", role: "client", isOwner: false });
    expect(screen.getByText("Los clientes no envían propuestas.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
