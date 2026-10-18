// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PROJECT_LIMITS } from "@/modules/projects/schemas/project.schema";
import {
  PROPOSAL_LIMITS,
  myProposalsQuerySchema,
  parseProposalForm,
  projectProposalsQuerySchema,
  proposalInputSchema,
} from "@/modules/proposals/schemas/proposal.schema";
import { ProposalError } from "@/modules/proposals/services/proposal-errors";

const DESC = "d".repeat(30);

const valid = { priceCents: 150_000, timelineWeeks: 8, description: DESC };

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const validForm = { priceUsd: "1500", timelineWeeks: "8", description: DESC };

describe("PROPOSAL_LIMITS", () => {
  it("reuses the project limits for price and timeline", () => {
    expect(PROPOSAL_LIMITS.priceCents).toBe(PROJECT_LIMITS.budgetCents);
    expect(PROPOSAL_LIMITS.timelineWeeks).toBe(PROJECT_LIMITS.timelineWeeks);
  });
});

describe("proposalInputSchema", () => {
  it("accepts a valid input", () => {
    expect(proposalInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts price borders 100 and 100_000_000", () => {
    expect(proposalInputSchema.safeParse({ ...valid, priceCents: 100 }).success).toBe(true);
    expect(proposalInputSchema.safeParse({ ...valid, priceCents: 100_000_000 }).success).toBe(true);
  });

  it("rejects price outside borders or non integer", () => {
    for (const priceCents of [99, 0, -5, 100_000_001, 150.5]) {
      expect(proposalInputSchema.safeParse({ ...valid, priceCents }).success).toBe(false);
    }
  });

  it("accepts timeline borders 1 and 104", () => {
    expect(proposalInputSchema.safeParse({ ...valid, timelineWeeks: 1 }).success).toBe(true);
    expect(proposalInputSchema.safeParse({ ...valid, timelineWeeks: 104 }).success).toBe(true);
  });

  it("rejects timeline outside borders or non integer", () => {
    for (const timelineWeeks of [0, 105, 2.5, -1]) {
      expect(proposalInputSchema.safeParse({ ...valid, timelineWeeks }).success).toBe(false);
    }
  });

  it("accepts description borders 30 and 5000", () => {
    expect(proposalInputSchema.safeParse({ ...valid, description: "a".repeat(30) }).success).toBe(true);
    expect(proposalInputSchema.safeParse({ ...valid, description: "a".repeat(5000) }).success).toBe(true);
  });

  it("rejects description outside borders", () => {
    expect(proposalInputSchema.safeParse({ ...valid, description: "a".repeat(29) }).success).toBe(false);
    expect(proposalInputSchema.safeParse({ ...valid, description: "a".repeat(5001) }).success).toBe(false);
  });

  it("trims the description before measuring it", () => {
    expect(proposalInputSchema.safeParse({ ...valid, description: `  ${"a".repeat(29)}  ` }).success).toBe(false);
    const ok = proposalInputSchema.safeParse({ ...valid, description: `  ${"a".repeat(30)}  ` });
    expect(ok.success && ok.data.description).toBe("a".repeat(30));
  });
});

describe("parseProposalForm", () => {
  it("converts USD to integer cents without floats", () => {
    const result = parseProposalForm(form({ ...validForm, priceUsd: "1.07" }));
    expect(result).toEqual({
      success: true,
      data: { priceCents: 107, timelineWeeks: 8, description: DESC },
    });
  });

  it("parses a valid form", () => {
    const result = parseProposalForm(form(validForm));
    expect(result).toEqual({ success: true, data: valid });
  });

  it("ignores extra fields such as status, developerId and projectId", () => {
    const result = parseProposalForm(
      form({ ...validForm, status: "accepted", developerId: "x", projectId: "y" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual(["description", "priceCents", "timelineWeeks"]);
    }
  });

  it.each(["10.999", "1,5", "-1", "", "abc", "1e3"])(
    "reports a Spanish priceUsd error for %j without throwing",
    (priceUsd) => {
      const result = parseProposalForm(form({ ...validForm, priceUsd }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors.priceUsd).toMatch(/USD/);
        expect(result.values.priceUsd).toBe(priceUsd);
        expect(result.fieldErrors.timelineWeeks).toBeUndefined();
      }
    },
  );

  it("relabels price range errors to priceUsd", () => {
    const low = parseProposalForm(form({ ...validForm, priceUsd: "0.5" }));
    const high = parseProposalForm(form({ ...validForm, priceUsd: "1000000.01" }));
    expect(!low.success && low.fieldErrors.priceUsd).toBe("El precio debe ser al menos USD 1");
    expect(!high.success && high.fieldErrors.priceUsd).toBe("El precio no puede superar USD 1.000.000");
  });

  it("reports timeline errors for non integer or out of range values", () => {
    for (const timelineWeeks of ["", "2.5", "abc", "0", "105", "-3"]) {
      const result = parseProposalForm(form({ ...validForm, timelineWeeks }));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors.timelineWeeks).toMatch(/plazo/i);
    }
  });

  it("reports description errors in Spanish", () => {
    const short = parseProposalForm(form({ ...validForm, description: "corta" }));
    const long = parseProposalForm(form({ ...validForm, description: "a".repeat(5001) }));
    expect(!short.success && short.fieldErrors.description).toBe(
      "La descripción debe tener al menos 30 caracteres",
    );
    expect(!long.success && long.fieldErrors.description).toBe(
      "La descripción no puede superar 5000 caracteres",
    );
  });

  it("returns values for every field and treats missing fields as empty", () => {
    const result = parseProposalForm(new FormData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.values).toEqual({ priceUsd: "", timelineWeeks: "", description: "" });
      expect(Object.keys(result.fieldErrors).sort()).toEqual(["description", "priceUsd", "timelineWeeks"]);
    }
  });
});

describe("myProposalsQuerySchema", () => {
  it("applies defaults", () => {
    expect(myProposalsQuerySchema.parse({})).toEqual({ status: "all", page: 1 });
  });

  it("accepts valid values", () => {
    expect(myProposalsQuerySchema.parse({ status: "pending", page: "3" })).toEqual({
      status: "pending",
      page: 3,
    });
  });

  it("falls back to defaults on invalid input", () => {
    for (const page of ["0", "-2", "x", "1.5"]) {
      expect(myProposalsQuerySchema.parse({ status: "bogus", page })).toEqual({ status: "all", page: 1 });
    }
  });
});

describe("projectProposalsQuerySchema", () => {
  const uuid = "8f1c6c1e-2b0a-4f7e-9d3a-5a1b2c3d4e5f";

  it("applies defaults", () => {
    expect(projectProposalsQuerySchema.parse({})).toEqual({
      sort: "recent",
      page: 1,
      proposal: undefined,
    });
  });

  it("accepts valid values", () => {
    expect(
      projectProposalsQuerySchema.parse({ sort: "price_asc", page: "2", proposal: uuid }),
    ).toEqual({ sort: "price_asc", page: 2, proposal: uuid });
    expect(projectProposalsQuerySchema.parse({ sort: "timeline_asc" }).sort).toBe("timeline_asc");
  });

  it("falls back to defaults on invalid input and drops a non-UUID proposal", () => {
    expect(
      projectProposalsQuerySchema.parse({ sort: "x", page: "0", proposal: "not-a-uuid" }),
    ).toEqual({ sort: "recent", page: 1, proposal: undefined });
  });
});

describe("ProposalError", () => {
  it("carries code and 409 status", () => {
    const error = new ProposalError("RESEND_NOT_ALLOWED");
    expect(error.code).toBe("RESEND_NOT_ALLOWED");
    expect(error.status).toBe(409);
    expect(error).toBeInstanceOf(Error);
  });
});
