import { Input } from "@/components/ui/input";
import type { PublicCatalogQuery } from "@/modules/projects/types/public-project.types";

type Props = { query: PublicCatalogQuery };

/**
 * Green strip with the page title and the search field. The field belongs to the
 * `catalog-filters` GET form through the `form` attribute, so searching keeps the
 * active filters and applying filters keeps `q` (works without JavaScript).
 */
export function PublicCatalogHero({ query }: Props) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-end justify-between gap-6 px-4 py-10 sm:px-6">
        <div className="flex max-w-[640px] flex-col gap-2.5">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Proyectos publicados
          </h1>
          <p className="text-base leading-relaxed text-on-dark">
            Encuentra proyectos que encajen con tus tecnologías y envía tu propuesta con precio y
            plazo.
          </p>
        </div>
        <div className="flex w-full max-w-[480px] min-w-0 flex-[1_1_360px] gap-2">
          <label htmlFor="catalog-q" className="sr-only">
            Buscar proyectos
          </label>
          <Input
            id="catalog-q"
            name="q"
            type="search"
            form="catalog-filters"
            defaultValue={query.q}
            maxLength={80}
            placeholder="Buscar por título, descripción o tecnología"
            className="h-12 flex-1 rounded-[10px] border-brand-deep-border bg-card px-4 text-foreground"
          />
          <button
            type="submit"
            form="catalog-filters"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-[10px] bg-chip px-5 text-[15px] font-extrabold text-primary outline-none transition-colors hover:bg-chip-border focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Buscar
          </button>
        </div>
      </div>
    </section>
  );
}
