import { CircleAlert, CircleCheck, Clock, CreditCard, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CONNECTED_ACCOUNT_STATUS_LABELS,
  type ConnectedAccountOverview,
  type ConnectedAccountStatus,
} from "@/modules/payments/types/connected-account.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

// Exhaustive: the compiler fails if a status is added without an icon and tone.
const STATUS_ICON: Record<ConnectedAccountStatus, { icon: LucideIcon; box: string }> = {
  active: { icon: CircleCheck, box: "bg-success-bg text-success-fg" },
  pending: { icon: Clock, box: "bg-warning-bg text-warning-fg" },
  restricted: { icon: CircleAlert, box: "bg-danger-bg text-danger-fg" },
  not_started: { icon: CreditCard, box: "bg-neutral-bg text-neutral-fg" },
};

function linkLabel(payouts: ConnectedAccountOverview): string {
  if (payouts.status === "active") return "Ver cobros";
  return payouts.hasStripeAccount ? "Continuar configuración" : "Configurar cobros de prueba";
}

type Props = { payouts: ConnectedAccountOverview };

export function DeveloperPayoutStatus({ payouts }: Props) {
  const active = payouts.status === "active";
  const { icon: Icon, box } = STATUS_ICON[payouts.status];

  return (
    <section aria-labelledby="developer-payouts-title" className="surface flex flex-wrap items-center gap-5 p-6">
      <span aria-hidden="true" className={cn("flex size-[52px] shrink-0 items-center justify-center rounded-[14px]", box)}>
        <Icon className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
        <h2
          id="developer-payouts-title"
          className="text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase"
        >
          Cobros de prueba
        </h2>
        <p className="text-lg font-extrabold break-words text-foreground">
          {CONNECTED_ACCOUNT_STATUS_LABELS[payouts.status]}
        </p>
        {payouts.statusSyncedAt ? (
          <p className="text-[13px] text-muted-foreground">
            Última consulta a Stripe: {dateFormatter.format(payouts.statusSyncedAt)}
          </p>
        ) : null}
        {active ? null : (
          <p className="text-sm text-muted-foreground">
            Sin cobros activos no puedes enviar propuestas ni recibir la transferencia de prueba.
          </p>
        )}
      </div>
      <Link
        href="/dashboard/payouts"
        className={cn(buttonVariants({ variant: active ? "outline" : "default", size: "touch" }), FOCUS)}
      >
        {linkLabel(payouts)}
      </Link>
    </section>
  );
}
