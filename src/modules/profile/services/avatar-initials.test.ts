// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getInitials } from "./avatar-initials";

describe("getInitials", () => {
  it.each([
    ["Lucía Ramos", "LR"],
    ["madonna", "M"],
    ["  ana   maría   pérez ", "AM"],
    ["Deleted user", "DU"],
    ["ángel-luis", "ÁL"],
    ["😀 Zoe", "Z"],
    ["𝒜lex Kim", "𝒜K"],
    ["", "?"],
    ["   ", "?"],
    ["!!! ---", "?"],
  ])("%j -> %j", (input, expected) => {
    expect(getInitials(input)).toBe(expected);
  });
});
