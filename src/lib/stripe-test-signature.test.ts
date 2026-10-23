// @vitest-environment node
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { tamperSignature } from "./stripe-test-signature";

const SECRET = "whsec_FAKESECRETFORTESTS";
const SHAPE = /^t=\d+,v1=[0-9a-f]{64}$/;

describe("tamperSignature", () => {
  it("always changes the signature and keeps its shape (256 timestamps)", () => {
    let startsWithZero = 0;
    for (let i = 0; i < 256; i++) {
      const sig = Stripe.webhooks.generateTestHeaderString({
        payload: "{}",
        secret: SECRET,
        timestamp: 1_700_000_000 + i,
      });
      expect(sig).toMatch(SHAPE);
      if (sig.includes("v1=0")) startsWithZero++;

      const tampered = tamperSignature(sig);
      expect(tampered).not.toBe(sig);
      expect(tampered).toMatch(SHAPE);
      expect(tampered.split(",")[0]).toBe(sig.split(",")[0]);
    }
    expect(startsWithZero).toBeGreaterThan(0);
  });

  it("swaps a leading 0 for 1 and any other digit for 0", () => {
    expect(tamperSignature("t=1,v1=0abc")).toBe("t=1,v1=1abc");
    expect(tamperSignature("t=1,v1=fabc")).toBe("t=1,v1=0abc");
  });
});
