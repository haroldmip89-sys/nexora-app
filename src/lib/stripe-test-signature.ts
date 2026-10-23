/**
 * Test helper: alters a Stripe signature header (`t=…,v1=…`) so it is always
 * different from the original. Replacing the first hex digit with a fixed
 * value is not enough: 1/16 of HMACs already start with that digit.
 */
export function tamperSignature(sig: string): string {
  return sig.replace(/v1=([0-9a-f])/, (_, c: string) =>
    c === "0" ? "v1=1" : "v1=0",
  );
}
