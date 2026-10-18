import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { PublicProjectCard } from "@/modules/projects/components/public-project-card";
import { buildCatalogHref } from "@/modules/projects/schemas/public-catalog.schema";
import { listPublicProjects } from "@/modules/projects/services/public-catalog.service";
import type {
  PublicCatalogPage,
  PublicCatalogQuery,
} from "@/modules/projects/types/public-project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const LINK = cn("rounded-sm text-sm font-medium text-[#183D30] underline", FOCUS);
const EMPTY_CLASS = "border-[#E3E8E3] bg-white";
const PAGE_LINK = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-[#E3E8E3] bg-white px-3 text-sm font-medium text-[#183D30]",
  FOCUS,
);

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

function Pagination({ data, query }: { data: PublicCatalogPage; query: PublicCatalogQuery }) {
  const { page, totalPages } = data;
  return (
    <nav aria-label="Paginación" className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={buildCatalogHref(query, { page: page - 1 })} rel="prev" className={PAGE_LINK}>
          Anterior
        </Link>
      ) : null}
      <span className="text-sm text-[#535E56]">
        Página {page} de {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={buildCatalogHref(query, { page: page + 1 })} rel="next" className={PAGE_LINK}>
          Siguiente
        </Link>
      ) : null}
    </nav>
  );
}

/** Async list of results; the page wraps it in `<Suspense>` with the skeleton. */
export async function PublicCatalogResults({ query }: Props) {
  let data: PublicCatalogPage;
  try {
    data = await listPublicProjects(query);
  } catch (error) {
    console.error("listPublicProjects failed", error);
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
    <section aria-label="Resultados">
      <p className="mb-4 text-sm text-[#535E56]" role="status">
        Mostrando {data.total} {data.total === 1 ? "proyecto publicado" : "proyectos publicados"}
      </p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((project) => (
          <li key={project.id} className="flex">
            <PublicProjectCard project={project} />
          </li>
        ))}
      </ul>
      {data.totalPages > 1 ? <Pagination data={data} query={query} /> : null}
    </section>
  );
}
