import { z } from "zod";
import { usdToCents } from "@/lib/money";
import { PROJECT_LIMITS } from "@/modules/projects/schemas/project.schema";
import type {
  ProposalFieldErrors,
  ProposalFieldName,
  ProposalFormValues,
  ProposalInput,
} from "@/modules/proposals/types/proposal.types";

export const PROPOSAL_LIMITS = {
  priceCents: PROJECT_LIMITS.budgetCents,
  timelineWeeks: PROJECT_LIMITS.timelineWeeks,
  description: { min: 30, max: 5000 },
} as const;

const L = PROPOSAL_LIMITS;

export const proposalInputSchema = z.object({
  priceCents: z
    .number({ error: "El precio no es válido" })
    .int("El precio no es válido")
    .min(L.priceCents.min, "El precio debe ser al menos USD 1")
    .max(L.priceCents.max, "El precio no puede superar USD 1.000.000"),
  timelineWeeks: z
    .number({ error: "El plazo debe ser un número entero de semanas" })
    .int("El plazo debe ser un número entero de semanas")
    .min(L.timelineWeeks.min, `El plazo debe ser al menos ${L.timelineWeeks.min} semana`)
    .max(L.timelineWeeks.max, `El plazo no puede superar ${L.timelineWeeks.max} semanas`),
  description: z
    .string({ error: "La descripción es obligatoria" })
    .trim()
    .min(L.description.min, `La descripción debe tener al menos ${L.description.min} caracteres`)
    .max(L.description.max, `La descripción no puede superar ${L.description.max} caracteres`),
});

export const MY_PROPOSALS_STATUSES = [
  "all",
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

/** URL params for "Mis propuestas"; invalid or missing values fall back to defaults. */
export const myProposalsQuerySchema = z.object({
  status: z.enum(MY_PROPOSALS_STATUSES).catch("all"),
  page: z.coerce.number().int().min(1).catch(1),
});

export const PROJECT_PROPOSALS_SORTS = ["recent", "price_asc", "timeline_asc"] as const;

/** URL params for the client's proposals page; invalid values fall back to defaults. */
export const projectProposalsQuerySchema = z.object({
  sort: z.enum(PROJECT_PROPOSALS_SORTS).catch("recent"),
  page: z.coerce.number().int().min(1).catch(1),
  proposal: z.uuid().optional().catch(undefined),
});

export const PROPOSAL_FORM_FIELDS = [
  "priceUsd",
  "timelineWeeks",
  "description",
] as const satisfies readonly ProposalFieldName[];

const PRICE_USD_ERROR = "Ingresa un monto en USD válido (hasta 2 decimales, sin comas)";

/** Schema path -> UI field name. */
const FIELD_BY_PATH: Record<string, ProposalFieldName> = {
  priceCents: "priceUsd",
  timelineWeeks: "timelineWeeks",
  description: "description",
};

export type ParseProposalFormResult =
  | { success: true; data: ProposalInput }
  | { success: false; fieldErrors: ProposalFieldErrors; values: ProposalFormValues };

function readString(formData: FormData, name: ProposalFieldName): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Reads only the three form fields; any extra FormData entry is ignored. */
export function parseProposalForm(formData: FormData): ParseProposalFormResult {
  const values = Object.fromEntries(
    PROPOSAL_FORM_FIELDS.map((name) => [name, readString(formData, name)]),
  ) as ProposalFormValues;

  const priceCents = usdToCents(values.priceUsd);
  const weeksText = values.timelineWeeks.trim();

  const result = proposalInputSchema.safeParse({
    priceCents: priceCents ?? undefined,
    timelineWeeks: /^\d+$/.test(weeksText) ? Number(weeksText) : undefined,
    description: values.description,
  });

  if (result.success) return { success: true, data: result.data };

  const fieldErrors: ProposalFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = FIELD_BY_PATH[String(issue.path[0])];
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  if (priceCents === null) fieldErrors.priceUsd = PRICE_USD_ERROR;

  return { success: false, fieldErrors, values };
}
