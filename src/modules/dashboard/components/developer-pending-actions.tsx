import { Clock, CreditCard, RefreshCw, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DeveloperAction } from "@/modules/dashboard/types/developer-dashboard.types";
import type { ConnectedAccountStatus } from "@/modules/payments/types/connected-account.types";
import {
  DEVELOPER_TRANSFER_STATUS_LABELS,
  TRANSFER_REASON_MESSAGES,
} from "@/modules/payments/types/developer-transfer.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const SETUP_TEXT: Record<Exclude<ConnectedAccountStatus, "active">, string> = {
  not_started: "Configura tus cobros de prueba",
  pending: "Continúa o revisa tus cobros de prueba",
  restricted: "Tus cobros de prueba requieren acción",
};

const TONE_BOX = {
  danger: "bg-danger-bg text-danger-fg",
  warning: "bg-warning-bg text-warning-fg",
} as const;

function actionKey(action: DeveloperAction): string {
  return action.kind === "setup_payouts" ? action.kind : `${action.kind}-${action.projectId}`;
}

type RowProps = {
  icon: LucideIcon;
  tone: keyof typeof TONE_BOX;
  title: string;
  children?: React.ReactNode;
  trailing: React.ReactNode;
};

function ActionRow({ icon: Icon, tone, title, children, trailing }: RowProps) {
  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-[18px] last:border-b-0">
      <span
        aria-hidden="true"
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-[10px]", TONE_BOX[tone])}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
        <span className="text-[15px] font-bold break-words text-foreground">{title}</span>
        {children}
      </div>
      {trailing}
    </li>
  );
}

const DETAIL = "block text-[13px] break-words text-muted-foreground";
const CTA = cn(buttonVariants({ size: "touch" }), FOCUS);

function ActionItem({ action }: { action: DeveloperAction }) {
  switch (action.kind) {
    case "setup_payouts":
      return (
        <ActionRow
          icon={CreditCard}
          tone="warning"
          title={action.payoutsStatus === "active" ? "Configurar cobros de prueba" : SETUP_TEXT[action.payoutsStatus]}
          trailing={
            <Link href="/dashboard/payouts" className={CTA}>
              {action.hasStripeAccount ? "Continuar configuración" : "Configurar cobros de prueba"}
            </Link>
          }
        />
      );
    case "retry_transfer":
      return (
        <ActionRow
          icon={RefreshCw}
          tone="danger"
          title={action.projectTitle}
          trailing={
            <Link href="/dashboard/payouts" className={CTA}>
              Reintentar en Cobros de prueba
            </Link>
          }
        >
          <span className={DETAIL}>
            Transferencia de prueba: {DEVELOPER_TRANSFER_STATUS_LABELS[action.transferStatus]}
          </span>
          {action.reason ? <span className={DETAIL}>{TRANSFER_REASON_MESSAGES[action.reason]}</span> : null}
        </ActionRow>
      );
    case "awaiting_payment":
      return (
        <ActionRow
          icon={Clock}
          tone="warning"
          title={action.projectTitle}
          trailing={<Badge variant="neutral" className="h-auto px-3 py-1.5 font-bold">Informativa</Badge>}
        >
          <span className={DETAIL}>Esperando el pago de prueba del cliente</span>
          {action.payoutsReady ? null : (
            <span className={DETAIL}>El cliente no puede pagar hasta que configures tus cobros de prueba.</span>
          )}
        </ActionRow>
      );
  }
}

type Props = { actions: DeveloperAction[] };

export function DeveloperPendingActions({ actions }: Props) {
  return (
    <section aria-labelledby="developer-actions-title" className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2 id="developer-actions-title" className="text-base font-bold text-foreground">
          Acciones pendientes
        </h2>
        {actions.length > 0 ? (
          <Badge className="bg-secondary px-2.5 font-bold text-primary">{actions.length} por hacer</Badge>
        ) : null}
      </div>
      {actions.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted-foreground">No tienes nada pendiente.</p>
      ) : (
        <ul>
          {actions.map((action) => (
            <ActionItem key={actionKey(action)} action={action} />
          ))}
        </ul>
      )}
    </section>
  );
}
