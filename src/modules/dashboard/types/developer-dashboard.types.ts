import type { ConnectedAccountOverview } from "@/modules/payments/types/connected-account.types";
import type { DeveloperTransferStatus, TransferReason } from "@/modules/payments/types/developer-transfer.types";
import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types";
import type { ProposalStatus } from "@/modules/proposals/types/proposal.types";

export type DeveloperActionKind = "setup_payouts" | "retry_transfer" | "awaiting_payment";

export type DeveloperAction =
  | { kind: "setup_payouts"; payoutsStatus: ConnectedAccountOverview["status"]; hasStripeAccount: boolean }
  | { kind: "retry_transfer"; projectId: string; projectTitle: string; transferStatus: "pending" | "failed"; reason: TransferReason | null }
  | { kind: "awaiting_payment"; projectId: string; projectTitle: string; payoutsReady: boolean };

export type DeveloperWonProject = {
  projectId: string; // propio: ya lo ve en /dashboard/proposals (DeveloperProposal.projectId)
  title: string;
  status: "proposal_selected" | "contracted";
  clientName: string; // abbreviateClientName(users.display_name); sin email ni id
  amountCents: number; // de su propuesta aceptada
  payment: { status: PaymentAttemptStatus; updatedAt: Date } | null; // último intento; null = no iniciado
  transfer: { status: DeveloperTransferStatus; completedAt: Date | null; reason: TransferReason | null } | null; // del intento completed_test
};

export type DeveloperDashboard = {
  proposals: { total: number; byStatus: Record<ProposalStatus, number> }; // todas las claves, 0 si no hay
  payouts: ConnectedAccountOverview; // reutilizado tal cual
  ratings: DeveloperRatingSummary; // reutilizado tal cual
  pendingActions: DeveloperAction[];
  won: DeveloperWonProject[]; // updated_at desc, máx. DASHBOARD_LIST_LIMIT
  wonTotal: number; // total real, para decidir "Ver todas"
};
