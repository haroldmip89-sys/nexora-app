import { describe, expect, it } from "vitest";
import { isActivePath } from "@/lib/is-active-path";

describe("isActivePath", () => {
  it.each([
    ["/", "/", true],
    ["/projects/abc", "/", false],
    ["/projects", "/projects", true],
    ["/projects/abc", "/projects", true],
    ["/projects/abc/edit", "/projects", true],
    ["/projectsx", "/projects", false],
    ["/dashboard/projects", "/projects", false],
    ["/dashboard/projects", "/dashboard/projects", true],
  ])("isActivePath(%s, %s) -> %s", (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});
