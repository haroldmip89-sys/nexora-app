import Link from "next/link";

/** Presentational entry to test-mode payouts (spec 019 D15). No account status here. */
export function PayoutsLinkCard() {
  return (
    <section
      aria-labelledby="account-payouts-title"
      className="rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
    >
      <h2 id="account-payouts-title" className="text-lg font-semibold text-[#202522]">
        Cobros de prueba
      </h2>
      <p className="mt-2 text-sm text-[#535E56]">
        Configura tu cuenta de Stripe en modo de prueba para recibir transferencias de prueba. No es
        dinero real.
      </p>
      <Link
        href="/dashboard/payouts"
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-[#183D30] px-4 text-sm font-medium text-[#183D30] outline-none hover:bg-[#DCE6DE] focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
      >
        Ir a Cobros de prueba
      </Link>
    </section>
  );
}
