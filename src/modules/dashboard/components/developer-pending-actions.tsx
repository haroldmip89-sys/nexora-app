import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeveloperAction } from "@/modules/dashboard/types/developer-dashboard.types";
import type { ConnectedAccountStatus } from "@/modules/payments/types/connected-account.types";
import {
  DEVELOPER_TRANSFER_STATUS_LABELS,
  TRANSFER_REASON_MESSAGES,
} from "@/modules/payments/types/developer-transfer.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";

const SETUP_TEXT: Record<Exclude<ConnectedAccountStatus, "active">, string> = {
  not_started: "Configura tus cobros de prueba",
  pending: "Continúa o revisa tus cobros de prueba",
  restricted: "Tus cobros de prueba requieren acción",
};

function actionKey(action: DeveloperAction): string {
  return action.kind === "setup_payouts" ? action.kind : `${action.kind}-${action.projectId}`;
}

function ActionItem({ action }: { action: DeveloperAction }) {
  const row =
    "flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-3 sm:px-4";

  switch (action.kind) {
    case "setup_payouts":
      return (
        <li className={row}>
          <span className="min-w-0 break-words text-sm font-medium text-[#202522]">
            {action.payoutsStatus === "active"
              ? "Configurar cobros de prueba"
              : SETUP_TEXT[action.payoutsStatus]}
          </span>
          <Link href="/dashboard/payouts" className={cn(buttonVariants(), "h-10 px-4", PRIMARY_LINK, FOCUS)}>
            {action.hasStripeAccount ? "Continuar configuración" : "Configurar cobros de prueba"}
          </Link>
        </li>
      );
    case "retry_transfer":
      return (
        <li className={row}>
          <div className="min-w-0">
            <span className="block break-words text-sm font-medium text-[#202522]">{action.projectTitle}</span>
            <span className="block text-sm text-[#535E56]">
              Transferencia de prueba: {DEVELOPER_TRANSFER_STATUS_LABELS[action.transferStatus]}
            </span>
            {action.reason ? (
              <span className="block text-sm text-[#535E56]">{TRANSFER_REASON_MESSAGES[action.reason]}</span>
            ) : null}
          </div>
          <Link href="/dashboard/payouts" className={cn(buttonVariants(), "h-10 px-4", PRIMARY_LINK, FOCUS)}>
            Reintentar en Cobros de prueba
          </Link>
        </li>
      );
    case "awaiting_payment":
      return (
        <li className={row}>
          <div className="min-w-0">
            <span className="block break-words text-sm font-medium text-[#202522]">{action.projectTitle}</span>
            <span className="block text-sm text-[#535E56]">Esperando el pago de prueba del cliente</span>
            {action.payoutsReady ? null : (
              <span className="block text-sm text-[#535E56]">
                El cliente no puede pagar hasta que configures tus cobros de prueba.
              </span>
            )}
          </div>
          <Link
            href="/dashboard/proposals?status=accepted"
            className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4", FOCUS)}
          >
            Ver propuesta aceptada
          </Link>
        </li>
      );
  }
}

type Props = { actions: DeveloperAction[] };

export function DeveloperPendingActions({ actions }: Props) {
  return (
    <section aria-labelledby="developer-actions-title" className="mt-8">
      <h2 id="developer-actions-title" className="text-lg font-semibold text-[#202522]">
        Pendiente de ti
      </h2>
      {actions.length === 0 ? (
        <p className="mt-3 text-sm text-[#535E56]">No tienes nada pendiente.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {actions.map((action) => (
            <ActionItem key={actionKey(action)} action={action} />
          ))}
        </ul>
      )}
    </section>
  );
}
