// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getActiveHref, isActivePath } from "@/lib/is-active-path";

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

describe("getActiveHref", () => {
  const HREFS = ["/projects", "/dashboard", "/dashboard/account"];

  it.each([
    ["/dashboard/account", HREFS, "/dashboard/account"],
    ["/dashboard/proposals", HREFS, "/dashboard"],
    ["/projects/abc", HREFS, "/projects"],
    ["/somewhere-else", HREFS, null],
    ["/", ["/projects"], null],
  ])("getActiveHref(%s) -> %s", (pathname, hrefs, expected) => {
    expect(getActiveHref(pathname, hrefs)).toBe(expected);
  });
});
