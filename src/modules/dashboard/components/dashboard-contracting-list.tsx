import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DashboardProjectPayment } from "@/modules/dashboard/types/dashboard.types";
import { CancelPaymentButton } from "@/modules/payments/components/cancel-payment-button";
import {
  DEVELOPER_TRANSFER_STATUS_LABELS,
  TRANSFER_TEST_NOTICE,
} from "@/modules/payments/types/developer-transfer.types";
import { PAYMENT_ATTEMPT_STATUS_LABELS } from "@/modules/payments/types/payment.types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

type Props = {
  items: DashboardProjectPayment[];
  total: number;
};

function ContractingRow({ item }: { item: DashboardProjectPayment }) {
  const { payment, transfer } = item;
  const awaitingDeveloper =
    item.status === "proposal_selected" && !item.developerPayoutsReady && payment?.status !== "pending";

  return (
    <li className="flex flex-col gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold text-[#202522]">{item.title}</h3>
        <ProjectStatusBadge status={item.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-[#535E56]">Desarrollador</dt>
          <dd className="break-words text-[#202522]">{item.developerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#535E56]">Importe</dt>
          <dd className="text-[#202522]">{formatUsd(item.amountCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#535E56]">Pago de prueba</dt>
          <dd className="text-[#202522]">
            {payment ? PAYMENT_ATTEMPT_STATUS_LABELS[payment.status] : "No iniciado"}
            {payment ? (
              <span className="text-xs text-[#535E56]">
                {" "}
                · {dateFormatter.format(payment.updatedAt)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[#535E56]">Transferencia</dt>
          <dd className="text-[#202522]">
            {transfer ? (
              <>
                {DEVELOPER_TRANSFER_STATUS_LABELS[transfer.status]}
                <span className="block text-xs text-[#535E56]">{TRANSFER_TEST_NOTICE}</span>
              </>
            ) : (
              "Sin transferencia todavía"
            )}
          </dd>
        </div>
      </dl>
      {awaitingDeveloper ? (
        <p className="text-sm text-[#535E56]">
          Esperando que el desarrollador configure sus cobros de prueba
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-[#E3E8E3] pt-3">
        <Link
          href={`/projects/${item.projectId}/payment`}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4", FOCUS)}
        >
          Ver pago
        </Link>
        {item.status === "contracted" && item.rated ? (
          <Link
            href={`/projects/${item.projectId}/rate`}
            className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4", FOCUS)}
          >
            Ver tu valoración
          </Link>
        ) : null}
        {payment?.status === "pending" ? <CancelPaymentButton projectId={item.projectId} /> : null}
      </div>
    </li>
  );
}

export function DashboardContractingList({ items, total }: Props) {
  const showAll = total > items.length;
  return (
    <section aria-labelledby="dashboard-contracting-title" className="mt-8">
      <h2 id="dashboard-contracting-title" className="text-lg font-semibold text-[#202522]">
        Pagos y contratación
      </h2>
      <p
        role="note"
        className="mt-3 rounded-[14px] border border-[#183D30] bg-[#DCE6DE] p-3 text-sm text-[#202522]"
      >
        <strong className="font-semibold">Modo de prueba · No se mueve dinero real</strong>
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[#535E56]">Aún no tienes proyectos en contratación.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <ContractingRow key={item.projectId} item={item} />
          ))}
        </ul>
      )}
      {showAll ? (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link
            href="/dashboard/projects?status=proposal_selected"
            className={cn("inline-flex min-h-10 items-center font-medium text-[#183D30] underline", FOCUS)}
          >
            Ver todos (en contratación)
          </Link>
          <Link
            href="/dashboard/projects?status=contracted"
            className={cn("inline-flex min-h-10 items-center font-medium text-[#183D30] underline", FOCUS)}
          >
            Ver todos (contratados)
          </Link>
        </p>
      ) : null}
    </section>
  );
}
