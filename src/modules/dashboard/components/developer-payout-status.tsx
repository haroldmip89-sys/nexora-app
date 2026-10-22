import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CONNECTED_ACCOUNT_STATUS_LABELS,
  type ConnectedAccountOverview,
} from "@/modules/payments/types/connected-account.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";

function linkLabel(payouts: ConnectedAccountOverview): string {
  if (payouts.status === "active") return "Ver cobros";
  return payouts.hasStripeAccount ? "Continuar configuración" : "Configurar cobros de prueba";
}

type Props = { payouts: ConnectedAccountOverview };

export function DeveloperPayoutStatus({ payouts }: Props) {
  const active = payouts.status === "active";
  return (
    <section aria-labelledby="developer-payouts-title" className="mt-8">
      <h2 id="developer-payouts-title" className="text-lg font-semibold text-[#202522]">
        Cobros de prueba
      </h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4">
        <div className="min-w-0">
          <p className="text-xs text-[#535E56]">Estado de tu cuenta de cobros</p>
          <p className="break-words text-sm font-medium text-[#202522]">
            {CONNECTED_ACCOUNT_STATUS_LABELS[payouts.status]}
          </p>
          {active ? null : (
            <p className="mt-1 text-sm text-[#535E56]">
              Sin cobros activos no puedes enviar propuestas ni recibir la transferencia de prueba.
            </p>
          )}
        </div>
        <Link
          href="/dashboard/payouts"
          className={cn(
            buttonVariants({ variant: active ? "outline" : "default" }),
            "h-10 px-4",
            active ? null : PRIMARY_LINK,
            FOCUS,
          )}
        >
          {linkLabel(payouts)}
        </Link>
      </div>
    </section>
  );
}
