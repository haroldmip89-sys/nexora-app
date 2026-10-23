// @vitest-environment node

import { describe, expect, it } from "vitest"

import { centsToUsd, formatUsd, usdToCents } from "./money"

describe("usdToCents", () => {
  it.each([
    ["1500", 150000],
    ["1500.5", 150050],
    ["1500.50", 150050],
    ["0.07", 7],
    ["19.99", 1999],
    ["1.15", 115],
    ["0", 0],
    ["0.00", 0],
    ["007.5", 750],
    ["  12.30  ", 1230],
  ])("parses %j -> %d", (input, expected) => {
    expect(usdToCents(input)).toBe(expected)
  })

  it("accepts numbers", () => {
    expect(usdToCents(19.99)).toBe(1999)
    expect(usdToCents(5)).toBe(500)
  })

  it.each(["", " ", "-1", "+1", "1,500", "1e3", "10.999", "abc", ".5", "5.", "1 000"])(
    "returns null for %j",
    (input) => {
      expect(usdToCents(input)).toBeNull()
    },
  )

  it("returns null for non-finite or exponent numbers", () => {
    expect(usdToCents(-1)).toBeNull()
    expect(usdToCents(1e21)).toBeNull()
    expect(usdToCents(Number.NaN)).toBeNull()
  })

  it("returns null above MAX_SAFE_INTEGER", () => {
    expect(usdToCents("99999999999999999999")).toBeNull()
  })
})

describe("centsToUsd", () => {
  it("formats without separators", () => {
    expect(centsToUsd(150050)).toBe("1500.50")
    expect(centsToUsd(7)).toBe("0.07")
    expect(centsToUsd(0)).toBe("0.00")
    expect(centsToUsd(100000000)).toBe("1000000.00")
  })

  it("round-trips with usdToCents", () => {
    expect(usdToCents(centsToUsd(1999))).toBe(1999)
  })
})

describe("formatUsd", () => {
  it("formats as en-US currency", () => {
    expect(formatUsd(150050)).toBe("$1,500.50")
    expect(formatUsd(7)).toBe("$0.07")
    expect(formatUsd(0)).toBe("$0.00")
  })
})
