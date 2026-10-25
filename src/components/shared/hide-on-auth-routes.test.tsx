import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HideOnAuthRoutes } from "@/components/shared/hide-on-auth-routes";

const pathnameMock = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value }));

describe("HideOnAuthRoutes", () => {
  afterEach(cleanup);

  it.each(["/", "/projects", "/dashboard"])("shows its children on %s", (path) => {
    pathnameMock.value = path;
    render(<HideOnAuthRoutes><footer>pie</footer></HideOnAuthRoutes>);
    expect(screen.getByText("pie")).toBeInTheDocument();
  });

  it.each(["/sign-in", "/sign-up"])("hides its children on %s", (path) => {
    pathnameMock.value = path;
    render(<HideOnAuthRoutes><footer>pie</footer></HideOnAuthRoutes>);
    expect(screen.queryByText("pie")).toBeNull();
  });
});
