import { Badge } from "@/components/ui/badge";
import {
  DEVELOPER_TRANSFER_STATUS_LABELS,
  type DeveloperTransferStatus,
} from "@/modules/payments/types/developer-transfer.types";
import {
  PAYMENT_ATTEMPT_STATUS_LABELS,
  type PaymentAttemptStatus,
} from "@/modules/payments/types/payment.types";

type Tone = "success" | "warning" | "danger" | "neutral";

// Exhaustive: the compiler fails if a status is added without a tone.
const PAYMENT_TONES: Record<PaymentAttemptStatus, Tone> = {
  pending: "warning",
  completed_test: "success",
  failed: "danger",
  canceled: "neutral",
};

const TRANSFER_TONES: Record<DeveloperTransferStatus, Tone> = {
  pending: "warning",
  completed_test: "success",
  failed: "danger",
};

export function PaymentStatusBadge({ status }: { status: PaymentAttemptStatus }) {
  return (
    <Badge variant={PAYMENT_TONES[status]}>
      {PAYMENT_ATTEMPT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function TransferStatusBadge({
  status,
}: {
  status: DeveloperTransferStatus;
}) {
  return (
    <Badge variant={TRANSFER_TONES[status]}>
      {DEVELOPER_TRANSFER_STATUS_LABELS[status]}
    </Badge>
  );
}
