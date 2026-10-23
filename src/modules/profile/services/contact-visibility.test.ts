// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Role } from "@/modules/auth/types/auth.types";
import type { ContactVisibility } from "@/modules/profile/types/developer-profile.types";
import { resolveContactEmail } from "./contact-visibility";

const OWNER = "owner-id";
const EMAIL = "contact@example.com";
const ROLES: Role[] = ["client", "developer", "admin"];
const VISIBILITIES: ContactVisibility[] = ["accepted_client", "any_client", "nobody"];

function resolve(
  visibility: ContactVisibility,
  viewer: { id: string; role: Role } | null,
  accepted = false,
  contactEmail: string | null = EMAIL,
) {
  return resolveContactEmail({
    contactEmail,
    visibility,
    viewer,
    ownerId: OWNER,
    viewerHasAcceptedProposalWithOwner: accepted,
  });
}

describe("resolveContactEmail", () => {
  it.each([null, ""])("no stored email (%j) -> none for everyone", (stored) => {
    for (const v of VISIBILITIES) {
      expect(resolve(v, { id: OWNER, role: "developer" }, true, stored)).toEqual({ email: null, state: "none" });
      expect(resolve(v, { id: "c", role: "client" }, true, stored)).toEqual({ email: null, state: "none" });
    }
  });

  it.each(VISIBILITIES)("owner always sees it (%s)", (v) => {
    expect(resolve(v, { id: OWNER, role: "developer" })).toEqual({ email: EMAIL, state: "visible" });
  });

  it.each(ROLES)("nobody: %s and anonymous get hidden_by_owner", (role) => {
    expect(resolve("nobody", { id: "x", role }, true)).toEqual({ email: null, state: "hidden_by_owner" });
    expect(resolve("nobody", null)).toEqual({ email: null, state: "hidden_by_owner" });
  });

  it.each(VISIBILITIES.filter((v) => v !== "nobody"))("%s: anonymous, developer and admin are restricted", (v) => {
    expect(resolve(v, null, true)).toEqual({ email: null, state: "restricted" });
    expect(resolve(v, { id: "d", role: "developer" }, true)).toEqual({ email: null, state: "restricted" });
    expect(resolve(v, { id: "a", role: "admin" }, true)).toEqual({ email: null, state: "restricted" });
  });

  it("any_client: any client sees it, with or without proposal", () => {
    expect(resolve("any_client", { id: "c", role: "client" }, false)).toEqual({ email: EMAIL, state: "visible" });
  });

  it("accepted_client: only a client with an accepted proposal", () => {
    expect(resolve("accepted_client", { id: "c", role: "client" }, true)).toEqual({ email: EMAIL, state: "visible" });
    expect(resolve("accepted_client", { id: "c", role: "client" }, false)).toEqual({ email: null, state: "restricted" });
  });
});
