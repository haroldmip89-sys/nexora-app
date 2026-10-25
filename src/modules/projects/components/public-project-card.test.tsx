import Link from "next/link";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicProjectCard } from "@/modules/projects/components/public-project-card";
import type { PublicProjectSummary } from "@/modules/projects/types/public-project.types";

const project: PublicProjectSummary = {
  id: "p1",
  category: "Full Stack",
  title: "Tienda en línea",
  summary: "Resumen del proyecto",
  technologies: ["React", "Node", "Postgres", "Docker", "Redis", "Go"],
  budgetMinCents: 100000,
  budgetMaxCents: 200000,
  timelineWeeks: 8,
  publishedAt: new Date("2026-01-15T00:00:00Z"),
};

afterEach(cleanup);

describe("PublicProjectCard", () => {
  it("without actions has a single stretched title link and the default footer", () => {
    const { container } = render(<PublicProjectCard project={project} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/projects/p1");
    expect(links[0].textContent).toBe("Tienda en línea");
    expect(links[0].className).toContain("after:absolute");
    expect(container.textContent).toContain("Ver detalle →");
  });

  it("with actions renders them above the stretched link and hides the default footer", () => {
    const { container } = render(
      <PublicProjectCard
        project={project}
        actions={<Link href="/projects/p1#propuesta">Enviar propuesta</Link>}
      />,
    );
    const action = screen.getByRole("link", { name: "Enviar propuesta" });
    expect(action.parentElement?.className).toContain("z-10");
    expect(container.textContent).not.toContain("Ver detalle →");
  });

  it("never nests anchors", () => {
    const { container } = render(
      <PublicProjectCard project={project} actions={<Link href="/x">Acción</Link>} />,
    );
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("shows visible labels, at most 4 technologies and a +N counter", () => {
    render(<PublicProjectCard project={project} />);
    expect(screen.getByText("Presupuesto")).toBeTruthy();
    expect(screen.getByText("Plazo")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("+2")).toBeTruthy();
  });
});
