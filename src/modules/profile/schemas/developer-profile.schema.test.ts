// @vitest-environment node

import { describe, expect, it } from "vitest";
import { developerProfileInputSchema, toDeveloperProfileFieldErrors } from "./developer-profile.schema";

const valid = {
  headline: "  Full stack dev  ",
  location: "Lima, Perú",
  availability: "available",
  bio: "Hola\nmundo",
  links: [{ type: "github", url: "https://github.com/ada" }],
  contactEmail: "ada@example.com",
  contactVisibility: "accepted_client",
};

const parse = (over: Record<string, unknown>) => developerProfileInputSchema.safeParse({ ...valid, ...over });
const link = (url: string) => ({ type: "other", url });

describe("developerProfileInputSchema", () => {
  it("accepts a valid input and trims headline", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.headline).toBe("Full stack dev");
  });

  it("accepts minimal input (no location, email, links)", () => {
    const r = parse({ location: "", contactEmail: "", links: [] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.location).toBeNull();
      expect(r.data.contactEmail).toBeNull();
    }
  });

  it("normalizes whitespace-only location and email to null", () => {
    const r = parse({ location: "   ", contactEmail: "  " });
    expect(r.success).toBe(true);
    if (r.success) expect([r.data.location, r.data.contactEmail]).toEqual([null, null]);
  });

  it("keeps the url as typed (trimmed)", () => {
    const r = parse({ links: [link("  https://Example.com/Path  ")] });
    expect(r.success && r.data.links[0].url).toBe("https://Example.com/Path");
  });

  it.each([
    ["empty headline", { headline: "   " }],
    ["81-char headline", { headline: "a".repeat(81) }],
    ["5001-char bio", { bio: "a".repeat(5001) }],
    ["81-char location", { location: "a".repeat(81) }],
    ["6 links", { links: Array.from({ length: 6 }, (_, i) => link(`https://site${i}.com`)) }],
    ["http url", { links: [link("http://example.com")] }],
    ["javascript url", { links: [link("javascript:alert(1)")] }],
    ["data url", { links: [link("data:text/html,hi")] }],
    ["no scheme", { links: [link("example.com")] }],
    ["protocol-relative", { links: [link("//example.com")] }],
    ["credentials", { links: [link("https://user:pw@example.com")] }],
    ["host without dot", { links: [link("https://localhost")] }],
    ["301-char url", { links: [link("https://example.com/" + "a".repeat(285))] }],
    ["empty url", { links: [link("")] }],
    ["duplicate url", { links: [link("https://example.com"), link("https://example.com")] }],
    ["unknown link type", { links: [{ type: "twitter", url: "https://x.com/a" }] }],
    ["invalid email", { contactEmail: "not-an-email" }],
    ["255-char email", { contactEmail: "a".repeat(244) + "@example.com" }],
    ["unknown availability", { availability: "busy" }],
    ["unknown visibility", { contactVisibility: "everyone" }],
    ["extra userId", { userId: "x" }],
    ["extra email", { email: "x@example.com" }],
    ["extra role", { role: "admin" }],
  ])("rejects %s", (_name, over) => {
    expect(parse(over).success).toBe(false);
  });

  it("accepts exactly the limits", () => {
    const r = parse({
      headline: "a".repeat(80),
      bio: "a".repeat(5000),
      location: "a".repeat(80),
      links: Array.from({ length: 5 }, (_, i) => link(`https://site${i}.com`)),
    });
    expect(r.success).toBe(true);
  });
});

describe("toDeveloperProfileFieldErrors", () => {
  it("returns one message per field and maps link errors to links", () => {
    const r = parse({
      headline: "",
      bio: "a".repeat(5001),
      contactEmail: "nope",
      links: [link("http://a.com"), link("javascript:x")],
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errors = toDeveloperProfileFieldErrors(r.error);
    expect(Object.keys(errors).sort()).toEqual(["bio", "contactEmail", "headline", "links"]);
    expect(errors.links).toBe("Escribe la URL completa, empezando por https://");
    expect(errors.headline).toBe("El titular es obligatorio");
  });

  it("reports duplicates under links", () => {
    const r = parse({ links: [link("https://a.com"), link("https://a.com")] });
    if (r.success) throw new Error("expected failure");
    expect(toDeveloperProfileFieldErrors(r.error).links).toBe("Este enlace ya está en tu lista");
  });
});
