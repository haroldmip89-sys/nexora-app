// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it.each([
    ["Lucía Ramos", "LR"],
    ["madonna", "M"],
    ["ángel-luis", "ÁL"],
    ["  ana   maría   pérez ", "AM"],
    ["", "?"],
    ["   ", "?"],
    ["!!! ---", "?"],
  ])("%j -> %j", (input, expected) => {
    expect(getInitials(input)).toBe(expected);
  });
});
