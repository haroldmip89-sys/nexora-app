// @vitest-environment node
import { describe, expect, it } from "vitest";
import { can } from "@/modules/auth/services/permissions";
import type { Action, Role } from "@/modules/auth/types/auth.types";

type Who = "visitor" | Role;
const roles: Who[] = ["visitor", "client", "developer", "admin"];

// Column order: visitor, client, developer, admin (spec 004 RF7).
const matrix: Record<Action, [boolean, boolean, boolean, boolean]> = {
  "catalog.view": [true, true, true, true],
  "project.create": [false, true, false, false],
  "project.update": [false, true, false, false],
  "project.publish": [false, true, false, false],
  "project.close": [false, true, false, true],
  "project.readPrivate": [false, true, false, true],
  "proposal.create": [false, false, true, false],
  "proposal.withdraw": [false, false, true, false],
  "proposal.read": [false, true, true, true],
  "proposal.select": [false, true, false, false],
  "payment.start": [false, true, false, false],
  "payment.read": [false, true, true, true],
};

describe("can", () => {
  for (const [action, expected] of Object.entries(matrix) as [Action, boolean[]][]) {
    roles.forEach((who, i) => {
      it(`${who} ${expected[i] ? "can" : "cannot"} ${action}`, () => {
        expect(can(who === "visitor" ? null : who, action)).toBe(expected[i]);
      });
    });
  }
});
