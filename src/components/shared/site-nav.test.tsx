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

    it.each([
      ["/dashboard/account", ["Mi cuenta"]],
      ["/dashboard", ["Mi panel"]],
      ["/dashboard/proposals", ["Mi panel"]],
      ["/projects/abc", ["Proyectos"]],
    ])("marks only one of three links on %s", (path, expected) => {
      pathnameMock.value = path;
      render(
        <SiteNav
          links={[PROJECTS, { href: "/dashboard", label: "Mi panel" }, { href: "/dashboard/account", label: "Mi cuenta" }]}
          signedIn
        />,
      );
      expect(currentLinks()).toEqual(expected);
    });

    it("does not treat /sign-up-free as an auth path (no current link)", () => {
      pathnameMock.value = "/sign-up-free";
      render(<SiteNav links={[PROJECTS]} signedIn={false} />);
      expect(currentLinks()).toEqual([]);
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

  describe("redesign (022a)", () => {
    it.each([true, false])("shows the Modo de prueba chip with signedIn=%s", (signedIn) => {
      render(<SiteNav links={[PROJECTS]} signedIn={signedIn} />);
      expect(screen.getByText("Modo de prueba")).toBeInTheDocument();
    });

    it("keeps the logo accessible name as Nexora with a decorative symbol", () => {
      render(<SiteNav links={[PROJECTS]} signedIn />);
      const logo = screen.getByRole("link", { name: "Nexora" });
      expect(logo.querySelector("img")).toHaveAttribute("alt", "");
    });

    it("marks a single aria-current on a nested route", () => {
      pathnameMock.value = "/dashboard/proposals";
      render(
        <SiteNav
          links={[{ href: "/dashboard", label: "Mi panel" }, PROJECTS, { href: "/dashboard/account", label: "Mi cuenta" }]}
          signedIn
        />,
      );
      expect(currentLinks()).toEqual(["Mi panel"]);
    });
  });

  describe("home anchors and CTA (022b)", () => {
    const ANCHORS = [
      { href: "/#proyectos", label: "Explorar proyectos" },
      { href: "/#como-funciona", label: "Cómo funciona" },
    ];
    const link = (name: string) => screen.queryAllByRole("link", { name, hidden: true });

    it("on / shows the anchors instead of Proyectos, without aria-current", () => {
      render(<SiteNav links={[PROJECTS]} signedIn={false} homeAnchors={ANCHORS} />);
      expect(link("Explorar proyectos")[0]).toHaveAttribute("href", "/#proyectos");
      expect(link("Cómo funciona")).toHaveLength(1);
      expect(link("Proyectos")).toHaveLength(0);
      expect(currentLinks()).toEqual(["Nexora"]);
    });

    it("on another route ignores anchors and CTA", () => {
      pathnameMock.value = "/projects";
      render(<SiteNav links={[PROJECTS]} signedIn={false} homeAnchors={ANCHORS} homeCta={{ kind: "visitor" }} />);
      expect(link("Cómo funciona")).toHaveLength(0);
      expect(link("Proyectos")).toHaveLength(1);
      expect(link("Publicar proyecto")).toHaveLength(0);
      expect(link("Registrarse")).toHaveLength(1);
    });

    it("without the new props behaves as before on /", () => {
      render(<SiteNav links={[PROJECTS]} signedIn={false} />);
      expect(link("Proyectos")).toHaveLength(1);
      expect(link("Registrarse")).toHaveLength(1);
    });

    it("visitor on / sees Publicar proyecto (sign-up) instead of Registrarse", () => {
      render(<SiteNav links={[PROJECTS]} signedIn={false} homeAnchors={ANCHORS} homeCta={{ kind: "visitor" }} />);
      expect(link("Publicar proyecto").length).toBeGreaterThan(0);
      for (const el of link("Publicar proyecto")) expect(el).toHaveAttribute("href", "/sign-up");
      expect(link("Registrarse")).toHaveLength(0);
      expect(link("Iniciar sesión")).toHaveLength(1);
    });

    it("member on / sees its CTA next to the UserButton", () => {
      render(
        <SiteNav
          links={[PROJECTS]}
          signedIn
          homeAnchors={ANCHORS}
          homeCta={{ kind: "member", label: "Ir a mi panel", href: "/dashboard" }}
        />,
      );
      expect(screen.getByTestId("user-button")).toBeInTheDocument();
      for (const el of link("Ir a mi panel")) expect(el).toHaveAttribute("href", "/dashboard");
      expect(link("Ir a mi panel").length).toBeGreaterThan(0);
    });

    it("none on / renders no extra CTA", () => {
      render(<SiteNav links={[PROJECTS]} signedIn homeAnchors={ANCHORS} homeCta={{ kind: "none" }} />);
      expect(link("Publicar proyecto")).toHaveLength(0);
      expect(link("Ir a mi panel")).toHaveLength(0);
    });

    it("closes the mobile menu when an anchor is clicked", async () => {
      const user = userEvent.setup();
      render(<SiteNav links={[PROJECTS]} signedIn homeAnchors={ANCHORS} />);
      const toggle = screen.getByRole("button", { name: /menú/i });
      await user.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      await user.click(link("Cómo funciona")[0]);
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
  });
  describe("sign-in and sign-up", () => {
    it.each(["/sign-in", "/sign-up"])("on %s shows only the logo and the test-mode chip", (path) => {
      pathnameMock.value = path;
      render(<SiteNav links={[PROJECTS]} signedIn={false} />);
      expect(screen.getByRole("link", { name: "Nexora" })).toHaveAttribute("href", "/");
      expect(screen.getByText("Modo de prueba")).toBeInTheDocument();
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(screen.queryByRole("link", { name: "Registrarse" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Proyectos" })).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
