import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-[#C9D3CB]">
      <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-dark.png" alt="" width={28} height={28} className="shrink-0" />
            <div>
              <p className="text-lg font-extrabold lowercase tracking-[-0.03em] text-white">
                Nexora
              </p>
              <p className="text-sm">
                Conecta proyectos de software con los desarrolladores que pueden hacerlos
                realidad.
              </p>
            </div>
          </div>
          <nav aria-label="Pie de página">
            <Link
              href="/projects"
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-white outline-none hover:underline focus-visible:ring-3 focus-visible:ring-[#C9D3CB]"
            >
              Proyectos
            </Link>
          </nav>
        </div>
        <div className="mt-4 flex flex-col gap-1 border-t border-footer-border pt-4 text-xs sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Nexora. Proyecto de demostración.</p>
          <p>Pagos procesados por Stripe en modo de prueba.</p>
        </div>
      </div>
    </footer>
  );
}
