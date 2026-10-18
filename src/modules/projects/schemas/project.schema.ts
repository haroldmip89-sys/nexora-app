import { z } from "zod";
import { usdToCents } from "@/lib/money";
import type {
  ProjectFieldErrors,
  ProjectFieldName,
  ProjectFormValues,
  ProjectInput,
} from "@/modules/projects/types/project.types";

/** Single source of truth for schema, form select and future catalog filter. */
export const PROJECT_CATEGORIES = [
  "Frontend & UI/UX",
  "Backend & APIs",
  "Full Stack",
  "E-commerce",
  "WordPress",
  "Otros",
] as const;

export const PROJECT_LIMITS = {
  title: { min: 5, max: 120 },
  description: { min: 30, max: 5000 },
  budgetCents: { min: 100, max: 100_000_000 },
  timelineWeeks: { min: 1, max: 104 },
  technologies: { minItems: 1, maxItems: 10, slugMaxLength: 40 },
} as const;

/** Shape of a catalog slug (`nodejs`, `c-sharp`); existence is checked by the service. */
export const TECHNOLOGY_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const L = PROJECT_LIMITS;

const cents = (label: string) =>
  z
    .number({ error: `${label} no es válido` })
    .int(`${label} no es válido`)
    .min(L.budgetCents.min, `${label} debe ser al menos USD 1`)
    .max(L.budgetCents.max, `${label} no puede superar USD 1.000.000`);

function dedupeTechnologies(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const projectInputSchema = z
  .object({
    title: z
      .string({ error: "El título es obligatorio" })
      .trim()
      .min(L.title.min, `El título debe tener al menos ${L.title.min} caracteres`)
      .max(L.title.max, `El título no puede superar ${L.title.max} caracteres`),
    category: z.enum(PROJECT_CATEGORIES, { error: "Selecciona una categoría válida" }),
    description: z
      .string({ error: "La descripción es obligatoria" })
      .trim()
      .min(L.description.min, `La descripción debe tener al menos ${L.description.min} caracteres`)
      .max(L.description.max, `La descripción no puede superar ${L.description.max} caracteres`),
    budgetMinCents: cents("El presupuesto mínimo"),
    budgetMaxCents: cents("El presupuesto máximo"),
    timelineWeeks: z
      .number({ error: "El plazo debe ser un número entero de semanas" })
      .int("El plazo debe ser un número entero de semanas")
      .min(L.timelineWeeks.min, `El plazo debe ser al menos ${L.timelineWeeks.min} semana`)
      .max(L.timelineWeeks.max, `El plazo no puede superar ${L.timelineWeeks.max} semanas`),
    technologies: z
      .array(
        z
          .string({ error: "Tecnología no válida" })
          .trim()
          .toLowerCase()
          .min(1, "Las tecnologías no pueden estar vacías")
          .max(L.technologies.slugMaxLength, "Tecnología no válida")
          .regex(TECHNOLOGY_SLUG_REGEX, "Tecnología no válida"),
        { error: "Indica al menos una tecnología" },
      )
      .min(L.technologies.minItems, "Indica al menos una tecnología")
      .max(L.technologies.maxItems, `Máximo ${L.technologies.maxItems} tecnologías`)
      .transform(dedupeTechnologies),
  })
  .superRefine((value, ctx) => {
    if (value.budgetMaxCents < value.budgetMinCents) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetMaxCents"],
        message: "El presupuesto máximo no puede ser menor que el mínimo",
      });
    }
  });

export const PROJECT_LIST_STATUSES = [
  "all",
  "draft",
  "published",
  "proposal_selected",
  "contracted",
  "closed",
] as const;

/** URL params for "Mis proyectos"; invalid or missing values fall back to defaults. */
export const projectListQuerySchema = z.object({
  status: z.enum(PROJECT_LIST_STATUSES).catch("all"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});

export const PROJECT_FORM_FIELDS = [
  "title",
  "category",
  "description",
  "budgetMinUsd",
  "budgetMaxUsd",
  "timelineWeeks",
  "technologies",
] as const satisfies readonly ProjectFieldName[];

const BUDGET_USD_ERROR = "Ingresa un monto en USD válido (hasta 2 decimales, sin comas)";

/** Schema path -> UI field name. */
const FIELD_BY_PATH: Record<string, ProjectFieldName> = {
  title: "title",
  category: "category",
  description: "description",
  budgetMinCents: "budgetMinUsd",
  budgetMaxCents: "budgetMaxUsd",
  timelineWeeks: "timelineWeeks",
  technologies: "technologies",
};

export type ParseProjectFormResult =
  | { success: true; data: ProjectInput }
  | { success: false; fieldErrors: ProjectFieldErrors; values: ProjectFormValues };

/** Repeated `technologies` inputs (one per checked tag); non-string entries are ignored. */
export function readTechnologies(formData: FormData): string[] {
  return formData.getAll("technologies").filter((v): v is string => typeof v === "string");
}

/** Reads every form field as submitted (used to refill the form after an error). */
export function readProjectFormValues(formData: FormData): ProjectFormValues {
  const text = Object.fromEntries(
    PROJECT_FORM_FIELDS.filter((name) => name !== "technologies").map((name) => [
      name,
      readString(formData, name),
    ]),
  );
  return { ...text, technologies: readTechnologies(formData) } as ProjectFormValues;
}

function readString(formData: FormData, name: ProjectFieldName): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseProjectForm(formData: FormData): ParseProjectFormResult {
  const values = readProjectFormValues(formData);

  const minCents = usdToCents(values.budgetMinUsd);
  const maxCents = usdToCents(values.budgetMaxUsd);
  const weeksText = values.timelineWeeks.trim();

  const result = projectInputSchema.safeParse({
    title: values.title,
    category: values.category,
    description: values.description,
    budgetMinCents: minCents ?? undefined,
    budgetMaxCents: maxCents ?? undefined,
    timelineWeeks: /^\d+$/.test(weeksText) ? Number(weeksText) : undefined,
    technologies: values.technologies,
  });

  if (result.success) return { success: true, data: result.data };

  const fieldErrors: ProjectFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = FIELD_BY_PATH[String(issue.path[0])];
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  if (minCents === null) fieldErrors.budgetMinUsd = BUDGET_USD_ERROR;
  if (maxCents === null) fieldErrors.budgetMaxUsd = BUDGET_USD_ERROR;

  return { success: false, fieldErrors, values };
}
