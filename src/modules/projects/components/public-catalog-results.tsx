import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { safeErrorLog } from "@/lib/safe-error-log";
import { cn } from "@/lib/utils";
import { PublicProjectCard } from "@/modules/projects/components/public-project-card";
import { buildCatalogHref } from "@/modules/projects/schemas/public-catalog.schema";
import { listPublicProjects } from "@/modules/projects/services/public-catalog.service";
import type {
  PublicCatalogPage,
  PublicCatalogQuery,
} from "@/modules/projects/types/public-project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const LINK = cn("rounded-sm text-sm font-bold text-primary underline", FOCUS);
const EMPTY_CLASS = "border-input bg-card";

type Props = { query: PublicCatalogQuery };

function hasActiveFilters(query: PublicCatalogQuery): boolean {
  return (
    query.q !== "" ||
    query.category !== "all" ||
    query.budgetMaxCents !== null ||
    query.weeks !== null ||
    query.technologies.length > 0
  );
}

/** Async list of results; the page wraps it in `<Suspense>` with the skeleton. */
export async function PublicCatalogResults({ query }: Props) {
  let data: PublicCatalogPage;
  try {
    data = await listPublicProjects(query);
  } catch (error) {
    console.error("listPublicProjects failed", safeErrorLog(error));
    return (
      <EmptyState
        title="No pudimos cargar los proyectos"
        description="Ocurrió un problema al consultar el catálogo. Inténtalo de nuevo."
        action={
          <Link href={buildCatalogHref(query, { page: query.page })} className={LINK}>
            Reintentar
          </Link>
        }
        className={EMPTY_CLASS}
      />
    );
  }

  if (data.total === 0) {
    return hasActiveFilters(query) ? (
      <EmptyState
        title="No hay proyectos que coincidan"
        description="No encontramos proyectos con estos filtros."
        action={
          <Link href="/projects" className={LINK}>
            Limpiar filtros
          </Link>
        }
        className={EMPTY_CLASS}
      />
    ) : (
      <EmptyState
        title="Aún no hay proyectos publicados"
        description="Vuelve pronto para ver nuevas oportunidades."
        className={EMPTY_CLASS}
      />
    );
  }

  if (data.items.length === 0) {
    return (
      <EmptyState
        title="No hay proyectos en esta página"
        action={
          <Link href={buildCatalogHref(query, { page: 1 })} className={LINK}>
            Ir a la primera página
          </Link>
        }
        className={EMPTY_CLASS}
      />
    );
  }

  return (
    <section aria-label="Resultados" className="flex flex-col gap-[18px]">
      <p className="text-base font-bold text-foreground" role="status">
        Mostrando {data.total} {data.total === 1 ? "proyecto publicado" : "proyectos publicados"}
      </p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        {data.items.map((project) => (
          <li key={project.id} className="flex">
            <PublicProjectCard project={project} />
          </li>
        ))}
      </ul>
      <PaginationNav
        page={data.page}
        totalPages={data.totalPages}
        buildHref={(target) => buildCatalogHref(query, { page: target })}
      />
    </section>
  );
}
