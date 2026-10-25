import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import type { DeveloperTransferStatus } from "@/modules/payments/types/developer-transfer.types";
import type { ProjectStatus } from "@/modules/projects/types/project.types";

export const DASHBOARD_LIST_LIMIT = 20;

export type DashboardActionKind = "choose_proposal" | "start_payment" | "resume_payment" | "rate";

export type DashboardAction = {
  kind: DashboardActionKind;
  projectId: string;
  projectTitle: string;
  /** Only for choose_proposal. */
  pendingProposals?: number;
};

export type DashboardProjectPayment = {
  projectId: string;
  title: string;
  status: "proposal_selected" | "contracted";
  /** Winner id (only builds the public profile link) and users.display_name; no email. */
  developerId: string;
  developerName: string;
  /** Developer's Clerk photo URL copy (users.image_url); null = initials. */
  imageUrl: string | null;
  /** From the accepted proposal. */
  amountCents: number;
  /** Latest attempt; null = not started. */
  payment: { status: PaymentAttemptStatus; updatedAt: Date } | null;
  /** Transfer of the latest completed_test attempt. */
  transfer: { status: DeveloperTransferStatus; completedAt: Date | null } | null;
  developerPayoutsReady: boolean;
  /** A developer_ratings row exists (only relevant when contracted). */
  rated: boolean;
};

export type ClientDashboard = {
  /** All keys present, 0 when absent. */
  counts: { total: number; byStatus: Record<ProjectStatus, number> };
  pendingActions: DashboardAction[];
  /** proposal_selected | contracted, updated_at desc, at most DASHBOARD_LIST_LIMIT. */
  contracting: DashboardProjectPayment[];
  /** Real total, to decide on "Ver todos". */
  contractingTotal: number;
};
