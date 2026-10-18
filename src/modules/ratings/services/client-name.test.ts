import { describe, expect, it } from "vitest";
import { abbreviateClientName } from "./client-name";

describe("abbreviateClientName", () => {
  it.each([
    ["Maria Gomez", "Maria G."],
    ["Ana María Pérez", "Ana P."],
    ["Maria", "Maria"],
    ["  juan   perez  ", "juan P."],
    ["Jean-Luc O’Brien", "Jean-Luc O."],
    ["Juan épsilon", "Juan É."],
    ["maria.gomez", "Cliente"],
    ["jperez1984", "Cliente"],
    ["maria@example.com", "Cliente"],
    ["Maria maria@example.com", "Cliente"],
    ["", "Cliente"],
    ["   ", "Cliente"],
    ["Deleted user", "Cliente"],
  ])("%j -> %j", (input, expected) => {
    expect(abbreviateClientName(input)).toBe(expected);
  });

  it("never exposes more than one initial of the surname", () => {
    expect(abbreviateClientName("Maria Gomez Lopez")).toBe("Maria L.");
  });
});
