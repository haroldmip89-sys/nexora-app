import { describe, expect, it } from "vitest";
import { selectProposalInputSchema } from "./proposal-selection.schema";

const projectId = "0b9b1f4e-4c1d-4d5e-8f3a-1a2b3c4d5e6f";
const proposalId = "7c1e2a3b-5d6f-4a7b-9c8d-0e1f2a3b4c5d";
const seenUpdatedAt = new Date("2026-03-01T10:20:30.123Z").toISOString();

const parse = (value: unknown) => selectProposalInputSchema.safeParse(value);

describe("selectProposalInputSchema", () => {
  it("accepts valid ids and converts the ISO version to a Date", () => {
    const result = parse({ projectId, proposalId, seenUpdatedAt });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seenUpdatedAt).toBeInstanceOf(Date);
      expect(result.data.seenUpdatedAt.getTime()).toBe(new Date(seenUpdatedAt).getTime());
    }
  });

  it("rejects invalid UUIDs", () => {
    expect(parse({ projectId: "nope", proposalId, seenUpdatedAt }).success).toBe(false);
    expect(parse({ projectId, proposalId: "123", seenUpdatedAt }).success).toBe(false);
    expect(parse({ projectId: "", proposalId, seenUpdatedAt }).success).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["not iso", "yesterday"],
    ["date only", "2026-03-01"],
    ["number", 1_700_000_000_000],
    ["null", null],
    ["impossible date", "2026-13-45T10:20:30.123Z"],
  ])("rejects an invalid version (%s)", (_label, value) => {
    expect(parse({ projectId, proposalId, seenUpdatedAt: value }).success).toBe(false);
  });

  it("rejects a missing version", () => {
    expect(parse({ projectId, proposalId }).success).toBe(false);
  });

  it("ignores extra fields", () => {
    const result = parse({ projectId, proposalId, seenUpdatedAt, priceCents: 1, clientId: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(["projectId", "proposalId", "seenUpdatedAt"]);
    }
  });
});
