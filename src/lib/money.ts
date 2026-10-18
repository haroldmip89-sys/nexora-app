const USD_INPUT = /^\d+(\.\d{1,2})?$/

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/**
 * Parses a USD amount ("1500", "1500.5", "0.07") into integer cents.
 * Works on the string digits (no floating point). Returns null when the
 * input is not a plain non-negative amount with up to 2 decimals.
 */
export function usdToCents(input: string | number): number | null {
  const text = typeof input === "number" ? String(input) : input.trim()
  if (!USD_INPUT.test(text)) return null

  const [whole, fraction = ""] = text.split(".")
  const cents = Number(whole + fraction.padEnd(2, "0"))
  return Number.isSafeInteger(cents) ? cents : null
}

/** Integer cents -> form input value, e.g. 150050 -> "1500.50". */
export function centsToUsd(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(Math.trunc(cents))
  const whole = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, "0")
  return `${sign}${whole}.${fraction}`
}

/** Integer cents -> display string, e.g. 150050 -> "$1,500.50". */
export function formatUsd(cents: number): string {
  return usdFormatter.format(Math.trunc(cents) / 100)
}
