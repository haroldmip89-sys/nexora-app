import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/money";
import { RetryTransfersButton } from "@/modules/payments/components/retry-transfers-button";
import {
  DEVELOPER_TRANSFER_STATUS_LABELS,
  TRANSFER_REASON_MESSAGES,
  TRANSFER_TEST_NOTICE,
  type DeveloperTransferItem,
} from "@/modules/payments/types/developer-transfer.types";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

type Props = { transfers: DeveloperTransferItem[] };

export function DeveloperTransfersList({ transfers }: Props) {
  const canRetry = transfers.some((t) => t.status === "pending" || t.status === "failed");

  return (
    <section
      aria-labelledby="payouts-transfers-title"
      className="mt-6 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
    >
      <h2 id="payouts-transfers-title" className="text-base font-semibold text-[#202522]">
        Transferencias de prueba
      </h2>
      <p className="mt-1 text-xs text-[#535E56]">{TRANSFER_TEST_NOTICE}</p>

      {transfers.length === 0 ? (
        <p className="mt-3 text-sm text-[#202522]">Aún no tienes transferencias de prueba.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {transfers.map((transfer) => (
            <li key={transfer.id} className="rounded-[12px] border border-[#E3E8E3] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-medium text-[#202522]">
                  {transfer.projectTitle}
                </p>
                <Badge
                  variant="outline"
                  className="h-auto min-h-5 whitespace-normal border-[#183D30] bg-[#F5F6F2] py-0.5 text-center text-[#183D30]"
                >
                  {DEVELOPER_TRANSFER_STATUS_LABELS[transfer.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[#202522]">{formatUsd(transfer.amountCents)}</p>
              {transfer.reason && transfer.status !== "completed_test" ? (
                <p className="mt-1 text-sm text-[#535E56]">
                  {TRANSFER_REASON_MESSAGES[transfer.reason]}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-[#535E56]">
                {transfer.completedAt
                  ? `Completada el ${dateFormatter.format(transfer.completedAt)}`
                  : `Creada el ${dateFormatter.format(transfer.createdAt)}`}
                {" · "}
                {TRANSFER_TEST_NOTICE}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canRetry ? (
        <div className="mt-4">
          <RetryTransfersButton />
        </div>
      ) : null}
    </section>
  );
}
