import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DeveloperTransfersList } from "@/modules/payments/components/developer-transfers-list";
import { RefreshConnectedAccountButton } from "@/modules/payments/components/refresh-connected-account-button";
import { StartPayoutOnboardingButton } from "@/modules/payments/components/start-payout-onboarding-button";
import {
  CONNECTED_ACCOUNT_STATUS_LABELS,
  type ConnectedAccountOverview,
} from "@/modules/payments/types/connected-account.types";
import type { DeveloperTransferItem } from "@/modules/payments/types/developer-transfer.types";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

type Notice = "returned" | "link_failed" | "sync_failed" | undefined;

// Informative only: the query param is user-controlled and never affects the status.
const NOTICES = {
  returned: "Volviste desde Stripe. Mostramos el estado que Stripe reporta ahora.",
  link_failed: "No pudimos abrir Stripe. Inténtalo de nuevo.",
  sync_failed: "No pudimos consultar el estado en Stripe. Usa «Actualizar estado».",
} as const;

type StatusContent = { text: string; startLabel: string | null; showRefresh: boolean };

function contentFor({ status, hasStripeAccount }: ConnectedAccountOverview): StatusContent {
  switch (status) {
    case "not_started":
      return hasStripeAccount
        ? {
            text: "Aún no completas el registro en Stripe.",
            startLabel: "Continuar configuración en Stripe",
            showRefresh: true,
          }
        : {
            text: "Configura tu cuenta de cobros de prueba en Stripe para recibir transferencias de prueba cuando un cliente confirme un pago.",
            startLabel: "Configurar cobros de prueba",
            showRefresh: false,
          };
    case "pending":
      return {
        text: "Stripe está revisando tus datos. Puede tardar unos minutos en modo de prueba.",
        startLabel: null,
        showRefresh: true,
      };
    case "restricted":
      return {
        text: "Stripe necesita más datos para habilitar tu cuenta.",
        startLabel: "Completar datos en Stripe",
        showRefresh: true,
      };
    case "active":
      return {
        text: "Tu cuenta puede recibir transferencias de prueba. Ninguna transferencia representa dinero real.",
        startLabel: null,
        showRefresh: true,
      };
  }
}

type Props = {
  overview: ConnectedAccountOverview;
  transfers: DeveloperTransferItem[];
  notice?: Notice;
};

export function PayoutsPageView({ overview, transfers, notice }: Props) {
  const content = contentFor(overview);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/account"
        className="mb-2 inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-[#183D30] underline outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
      >
        Volver a Mi cuenta
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Cobros de prueba</h1>

      <p
        role="note"
        className="mt-4 rounded-[14px] border border-[#183D30] bg-[#DCE6DE] p-4 text-sm text-[#202522]"
      >
        <strong className="font-semibold">Cobros de prueba · no es dinero real.</strong> Nexora usa
        Stripe en modo de prueba. Esta cuenta solo podrá recibir transferencias de prueba; nunca se
        mueve dinero real. Nexora no cobra comisiones ni custodia fondos.
      </p>

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-[14px] border border-[#E3E8E3] bg-[#F5F6F2] p-4 text-sm text-[#202522]"
        >
          {NOTICES[notice]}
        </p>
      ) : null}

      <section
        aria-labelledby="payouts-status-title"
        className="mt-6 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="payouts-status-title" className="text-base font-semibold text-[#202522]">
            Estado de tu cuenta
          </h2>
          <Badge
            variant="outline"
            className="h-auto min-h-5 whitespace-normal border-[#183D30] bg-[#F5F6F2] py-0.5 text-center text-[#183D30]"
          >
            {CONNECTED_ACCOUNT_STATUS_LABELS[overview.status]}
          </Badge>
        </div>

        <p className="mt-2 text-sm text-[#202522]">{content.text}</p>

        {overview.statusSyncedAt ? (
          <p className="mt-2 text-xs text-[#535E56]">
            Última consulta a Stripe: {dateFormatter.format(overview.statusSyncedAt)}
          </p>
        ) : null}

        {content.startLabel || content.showRefresh ? (
          <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
            {content.startLabel ? <StartPayoutOnboardingButton label={content.startLabel} /> : null}
            {content.showRefresh ? <RefreshConnectedAccountButton /> : null}
          </div>
        ) : null}
      </section>

      <DeveloperTransfersList transfers={transfers} />
    </main>
  );
}
