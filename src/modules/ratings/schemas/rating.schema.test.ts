import { describe, expect, it } from "vitest";
import { ratingInputSchema } from "./rating.schema";

describe("ratingInputSchema", () => {
  it.each([1, 2, 3, 4, 5])("accepts %i", (n) => {
    expect(ratingInputSchema.safeParse({ rating: n, comment: "" }).success).toBe(true);
  });

  it("accepts FormData strings (zod 4 coerce)", () => {
    const fd = new FormData();
    fd.set("rating", "4");
    fd.set("comment", "  Muy bien  ");
    const r = ratingInputSchema.safeParse({ rating: fd.get("rating"), comment: fd.get("comment") });
    expect(r.success && r.data).toEqual({ rating: 4, comment: "Muy bien" });
  });

  it.each([0, 6, 3.5, -1, "abc", "", null, undefined, "3.5"])("rejects rating %s", (v) => {
    const r = ratingInputSchema.safeParse({ rating: v, comment: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Elige entre 1 y 5 estrellas.");
  });

  it("accepts 600 chars and rejects 601", () => {
    expect(ratingInputSchema.safeParse({ rating: 5, comment: "a".repeat(600) }).success).toBe(true);
    const r = ratingInputSchema.safeParse({ rating: 5, comment: "a".repeat(601) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(["comment"]);
      expect(r.error.issues[0].message).toBe("El comentario no puede superar 600 caracteres.");
    }
  });

  it("trims and maps empty / whitespace-only / absent to null", () => {
    expect(ratingInputSchema.parse({ rating: 3, comment: "  hola " }).comment).toBe("hola");
    expect(ratingInputSchema.parse({ rating: 3, comment: "" }).comment).toBeNull();
    expect(ratingInputSchema.parse({ rating: 3, comment: "   \n " }).comment).toBeNull();
    expect(ratingInputSchema.parse({ rating: 3 }).comment).toBeNull();
  });

  it("rejects NUL characters", () => {
    expect(ratingInputSchema.safeParse({ rating: 3, comment: "a\u0000b" }).success).toBe(false);
  });
});
