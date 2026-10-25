import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUTTON = cn(
  buttonVariants({ variant: "outline", size: "touch" }),
  "rounded-[10px] border-input font-medium focus-visible:ring-ring/40",
);

type Props = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
};

function PageControl({ href, label, rel }: { href: string | null; label: string; rel: "prev" | "next" }) {
  if (href) {
    return (
      <Link href={href} rel={rel} className={BUTTON}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" disabled aria-disabled="true" className={BUTTON}>
      {label}
    </button>
  );
}

export function PaginationNav({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación"
      className="mt-6 flex items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <PageControl href={page > 1 ? buildHref(page - 1) : null} label="Anterior" rel="prev" />
      <span>
        Página {page} de {totalPages}
      </span>
      <PageControl href={page < totalPages ? buildHref(page + 1) : null} label="Siguiente" rel="next" />
    </nav>
  );
}
