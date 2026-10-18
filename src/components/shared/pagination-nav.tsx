import Link from "next/link";
import { cn } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";

type Props = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
};

export function PaginationNav({ page, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Paginación"
      className="mt-6 flex items-center justify-between gap-3 text-sm text-[#535E56]"
    >
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={cn("font-medium text-[#183D30] underline", FOCUS)}>
          Anterior
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span>
        Página {page} de {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className={cn("font-medium text-[#183D30] underline", FOCUS)}>
          Siguiente
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
