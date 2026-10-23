// @vitest-environment node

import { describe, expect, it } from "vitest";
import { safeErrorLog } from "@/lib/safe-error-log";

describe("safeErrorLog", () => {
  it("never leaks message, params, query, cause or stack of a Drizzle-like error", () => {
    const email = "ada@example.com";
    const error = Object.assign(
      new Error(`Failed query: select * from users where email = $1\nparams: ${email}`, {
        cause: new Error(`cause with ${email}`),
      }),
      { name: "DrizzleQueryError", query: "select 1", params: [email], code: "23505" },
    );
    const out = safeErrorLog(error);
    expect(out).toEqual({ name: "DrizzleQueryError", code: "23505" });
    expect(JSON.stringify(out)).not.toContain(email);
  });

  it("omits code when it is not a string", () => {
    expect(safeErrorLog(Object.assign(new TypeError("x"), { code: 500 }))).toEqual({ name: "TypeError" });
  });

  it("handles non-error values", () => {
    expect(safeErrorLog("secret text")).toEqual({ name: "UnknownError" });
    expect(safeErrorLog(null)).toEqual({ name: "UnknownError" });
    expect(safeErrorLog(undefined)).toEqual({ name: "UnknownError" });
  });
});
