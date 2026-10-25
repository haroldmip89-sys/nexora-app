import Link from "next/link";

/** Presentational entry to test-mode payouts (spec 019 D15). No account status here. */
export function PayoutsLinkCard() {
  return (
    <section aria-labelledby="account-payouts-title" id="cobros" className="surface p-5 sm:p-6">
      <h2 id="account-payouts-title" className="text-lg font-semibold text-foreground">
        Cobros de prueba
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Configura tu cuenta de Stripe en modo de prueba para recibir transferencias de prueba. No es
        dinero real.
      </p>
      <Link
        href="/dashboard/payouts"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[10px] border border-primary px-4 text-sm font-medium text-primary outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        Ir a Cobros de prueba
      </Link>
    </section>
  );
}
