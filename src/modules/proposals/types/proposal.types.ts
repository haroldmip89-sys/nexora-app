import type { ProjectStatus } from "@/modules/projects/types/project.types";
import type { proposalStatusEnum } from "@/modules/proposals/schema/proposals.table";
import type { proposalInputSchema } from "@/modules/proposals/schemas/proposal.schema";
import type { ProposalErrorCode } from "@/modules/proposals/services/proposal-errors";
import type { z } from "zod";

export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];

/** Domain shape (cents); what the service consumes. */
export type ProposalInput = z.infer<typeof proposalInputSchema>;

export type MyProposalsQuery = {
  status: "all" | ProposalStatus;
  page: number;
};

export type ProjectProposalsSort = "recent" | "price_asc" | "timeline_asc";

export type ProjectProposalsQuery = {
  sort: ProjectProposalsSort;
  page: number;
  proposal?: string;
};

/** What the author developer sees of their own proposal. */
export type DeveloperProposal = {
  id: string;
  projectId: string;
  status: ProposalStatus;
  priceCents: number;
  timelineWeeks: number;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  withdrawnAt: Date | null;
};

export type DeveloperProposalListItem = Omit<DeveloperProposal, "description"> & {
  projectTitle: string;
  projectStatus: ProjectStatus;
};

/** What the owner client sees: never contact, ids of users or profile data. */
export type ClientProposalSummary = {
  id: string;
  developerName: string;
  priceCents: number;
  timelineWeeks: number;
  status: ProposalStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientProposalDetail = ClientProposalSummary & { description: string };

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type MyProposalsPage = Paged<DeveloperProposalListItem>;
export type ProjectProposalsPage = Paged<ClientProposalSummary>;

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
};

export type ProposalFieldName = "priceUsd" | "timelineWeeks" | "description";

export type ProposalFieldErrors = Partial<Record<ProposalFieldName, string>>;
export type ProposalFormValues = Record<ProposalFieldName, string>;

export type ProposalFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      fieldErrors: ProposalFieldErrors;
      values: ProposalFormValues;
    };

export type SelectProposalInput = {
  projectId: string;
  proposalId: string;
  seenUpdatedAt: Date;
};

export type ProposalSelectionResult = {
  projectId: string;
  proposalId: string;
  selectedAt: Date;
  /** true only on the idempotent retry (the proposal was already the winner). */
  alreadySelected: boolean;
};

export type ProposalActionResult =
  | { ok: true }
  | {
      ok: false;
      code: ProposalErrorCode | "NOT_FOUND" | "RATE_LIMITED" | "UNKNOWN";
      message: string;
    };
