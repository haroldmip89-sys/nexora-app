import type { projects, projectStatusEnum } from "@/modules/projects/schema/projects.table";
import type { projectInputSchema } from "@/modules/projects/schemas/project.schema";
import type { ProjectErrorCode } from "@/modules/projects/services/project-errors";
import type { z } from "zod";

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];

export type Project = typeof projects.$inferSelect;

/** Domain shape (cents + technologies list); what the service consumes. */
export type ProjectInput = z.infer<typeof projectInputSchema>;

export type ProjectListQuery = {
  status: "all" | ProjectStatus;
  sort: "newest" | "oldest";
  page: number;
};

export type ProjectListItem = Pick<
  Project,
  | "id"
  | "title"
  | "category"
  | "status"
  | "budgetMinCents"
  | "budgetMaxCents"
  | "timelineWeeks"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
> & { proposalCount: number };

/** `technologies` are catalog slugs. */
export type ProjectDetail = Project & { proposalCount: number; technologies: string[] };

/** Catalog entry offered by the tag picker. */
export type TechnologyOption = { slug: string; name: string };

export type ProjectPage = {
  items: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  proposal_selected: "Con propuesta seleccionada · pendiente de pago",
  contracted: "En contratación",
  closed: "Cerrado",
};

export type ProjectFieldName =
  | "title"
  | "category"
  | "description"
  | "budgetMinUsd"
  | "budgetMaxUsd"
  | "timelineWeeks"
  | "technologies";

export type ProjectFieldErrors = Partial<Record<ProjectFieldName, string>>;
export type ProjectFormValues = Record<Exclude<ProjectFieldName, "technologies">, string> & {
  technologies: string[];
};

export type ProjectFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors: ProjectFieldErrors;
      values: ProjectFormValues;
    };

export type ProjectActionResult =
  | { ok: true }
  | {
      ok: false;
      code: ProjectErrorCode | "VALIDATION" | "NOT_FOUND" | "UNKNOWN";
      message: string;
    };
