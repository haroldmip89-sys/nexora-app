import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteNav } from "@/components/shared/site-nav";

const pathnameMock = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value }));
vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));

const PROJECTS = { href: "/projects", label: "Proyectos" };
const MY_PROJECTS = { href: "/dashboard/projects", label: "Mis proyectos" };

function currentLinks() {
  return screen
    .getAllByRole("link", { hidden: true })
    .filter((el) => el.getAttribute("aria-current") === "page")
    .map((el) => el.textContent);
}

describe("SiteNav", () => {
  afterEach(cleanup);

  beforeEach(() => {
    pathnameMock.value = "/";
  });

  describe("aria-current", () => {
    it.each([
      ["/", ["Nexora"]],
      ["/projects", ["Proyectos"]],
      ["/projects/abc", ["Proyectos"]],
      ["/dashboard/projects", ["Mis proyectos"]],
      ["/somewhere-else", []],
    ])("on %s marks %j", (path, expected) => {
      pathnameMock.value = path;
      render(<SiteNav links={[PROJECTS, MY_PROJECTS]} signedIn />);
      expect(currentLinks()).toEqual(expected);
    });

    it("marks Registrarse on /sign-up", () => {
      pathnameMock.value = "/sign-up";
      render(<SiteNav links={[PROJECTS]} signedIn={false} />);
      expect(currentLinks()).toEqual(["Registrarse"]);
    });
  });

  describe("session state", () => {
    it("shows sign-in and sign-up without UserButton when signed out", () => {
      render(<SiteNav links={[PROJECTS]} signedIn={false} />);
      expect(screen.getByRole("link", { name: "Iniciar sesión", hidden: true })).toHaveAttribute("href", "/sign-in");
      expect(screen.getByRole("link", { name: "Registrarse" })).toHaveAttribute("href", "/sign-up");
      expect(screen.queryByTestId("user-button")).not.toBeInTheDocument();
    });

    it("shows UserButton without session links when signed in", () => {
      render(<SiteNav links={[PROJECTS]} signedIn />);
      expect(screen.getByTestId("user-button")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Iniciar sesión", hidden: true })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Registrarse" })).not.toBeInTheDocument();
    });

    it("always renders the logo to / and the received links", () => {
      render(<SiteNav links={[PROJECTS, MY_PROJECTS]} signedIn />);
      expect(screen.getByRole("link", { name: "Nexora" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "Proyectos", hidden: true })).toHaveAttribute("href", "/projects");
      expect(screen.getByRole("link", { name: "Mis proyectos", hidden: true })).toHaveAttribute(
        "href",
        "/dashboard/projects",
      );
    });

    it.each([
      [{ href: "/dashboard/proposals", label: "Mis propuestas" }],
      [{ href: "/onboarding", label: "Completar registro" }],
    ])("renders role link %j", (link) => {
      render(<SiteNav links={[PROJECTS, link]} signedIn />);
      expect(screen.getByRole("link", { name: link.label, hidden: true })).toHaveAttribute("href", link.href);
    });

    it("renders only Proyectos when there is no dashboard link", () => {
      render(<SiteNav links={[PROJECTS]} signedIn />);
      const list = screen.getByRole("navigation", { name: "Principal", hidden: true });
      expect(list.querySelectorAll("a")).toHaveLength(1);
    });
  });

  describe("mobile menu", () => {
    const toggle = () => screen.getByRole("button", { name: /menú/i });

    it("is collapsed and linked to the list by default", () => {
      render(<SiteNav links={[PROJECTS]} signedIn />);
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      const controls = toggle().getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      expect(document.getElementById(controls!)).toBeInTheDocument();
    });

    it("opens and closes with the button", async () => {
      const user = userEvent.setup();
      render(<SiteNav links={[PROJECTS]} signedIn />);
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(toggle()).toHaveAccessibleName("Cerrar menú");
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes when a link is clicked", async () => {
      const user = userEvent.setup();
      render(<SiteNav links={[PROJECTS]} signedIn />);
      await user.click(toggle());
      await user.click(screen.getByRole("link", { name: "Proyectos", hidden: true }));
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes with Escape and returns focus to the button", async () => {
      const user = userEvent.setup();
      render(<SiteNav links={[PROJECTS]} signedIn />);
      await user.click(toggle());
      await user.keyboard("{Escape}");
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(toggle()).toHaveFocus();
    });
  });
});
