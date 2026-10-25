import Link from "next/link";
import { TagPicker } from "@/components/shared/tag-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { centsToUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PROJECT_CATEGORIES } from "@/modules/projects/schemas/project.schema";
import { buildCatalogHref } from "@/modules/projects/schemas/public-catalog.schema";
import type { TechnologyOption } from "@/modules/projects/types/project.types";
import {
  CATALOG_WEEK_OPTIONS,
  type PublicCatalogQuery,
} from "@/modules/projects/types/public-project.types";

const SORT_OPTIONS = [
  { value: "recent", label: "Más recientes" },
  { value: "budget_asc", label: "Presupuesto: menor a mayor" },
  { value: "budget_desc", label: "Presupuesto: mayor a menor" },
] as const;

const CONTROL = "h-11 rounded-[10px] bg-card text-base md:text-sm";
const SELECT_WRAPPER = "w-full";
const SELECT_CONTROL = "[&_select]:h-11 [&_select]:rounded-[10px] [&_select]:bg-card [&_select]:text-base md:[&_select]:text-sm";

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-bold text-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

type Props = { query: PublicCatalogQuery; technologies: TechnologyOption[] };

/** Native GET form: state lives in the URL and works without JavaScript. */
export function PublicCatalogFilters({ query, technologies }: Props) {
  const clearHref = buildCatalogHref(query, {
    q: "",
    terms: [],
    technologies: [],
    category: "all",
    budgetMaxCents: null,
    weeks: null,
    sort: "recent",
  });

  return (
    <form
      id="catalog-filters"
      role="search"
      aria-label="Buscar y filtrar proyectos"
      method="get"
      action="/projects"
      className="surface flex flex-col gap-5 p-5 sm:p-[22px]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">Filtros</h2>
        <Link
          href={clearHref}
          className="inline-flex min-h-11 items-center rounded-sm px-1.5 text-[13px] font-bold text-primary underline underline-offset-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          Limpiar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="Categoría" htmlFor="catalog-category">
          <NativeSelect
            id="catalog-category"
            name="category"
            defaultValue={query.category}
            className={cn(SELECT_WRAPPER, SELECT_CONTROL)}
          >
            <option value="all">Todas las categorías</option>
            {PROJECT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Presupuesto máximo (USD)" htmlFor="catalog-budget">
          <Input
            id="catalog-budget"
            name="budgetMax"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            pattern="\d+(\.\d{1,2})?"
            title="Monto en USD, por ejemplo 1500 o 1500.50"
            defaultValue={query.budgetMaxCents === null ? "" : centsToUsd(query.budgetMaxCents)}
            placeholder="Ej. 5000"
            className={CONTROL}
          />
        </Field>

        <Field label="Plazo" htmlFor="catalog-weeks">
          <NativeSelect
            id="catalog-weeks"
            name="weeks"
            defaultValue={query.weeks === null ? "" : String(query.weeks)}
            className={cn(SELECT_WRAPPER, SELECT_CONTROL)}
          >
            <option value="">Cualquier plazo</option>
            {CATALOG_WEEK_OPTIONS.map((weeks) => (
              <option key={weeks} value={weeks}>
                Hasta {weeks} semanas
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Ordenar por" htmlFor="catalog-sort">
          <NativeSelect
            id="catalog-sort"
            name="sort"
            defaultValue={query.sort}
            className={cn(SELECT_WRAPPER, SELECT_CONTROL)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <details open={query.technologies.length > 0} className="group rounded-[10px] border border-border p-3">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer items-center rounded-sm text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          )}
        >
          Tecnologías
          {query.technologies.length > 0 ? ` (${query.technologies.length})` : ""}
        </summary>
        <TagPicker
          name="tech"
          legend="Tecnologías"
          hideLegend
          options={technologies.map((tech) => ({ value: tech.slug, label: tech.name }))}
          defaultSelected={query.technologies}
          hint="Se muestran proyectos que usan todas las tecnologías elegidas (máx. 5)"
          className="mt-3"
        />
      </details>

      <Button type="submit" size="lg" className="h-11 w-full rounded-[10px]">
        Aplicar
      </Button>
    </form>
  );
}
