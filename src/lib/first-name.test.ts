// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getFirstName } from "./first-name";

describe("getFirstName", () => {
  it.each([
    ["Harold Inga", "Harold"],
    ["madonna", "madonna"],
    ["  Ana  María ", "Ana"],
    ["Óscar Peña", "Óscar"],
    ["", ""],
    ["   ", ""],
    ["!!! ---", ""],
    [null, ""],
    [undefined, ""],
  ])("%j -> %j", (input, expected) => {
    expect(getFirstName(input)).toBe(expected);
  });
});
