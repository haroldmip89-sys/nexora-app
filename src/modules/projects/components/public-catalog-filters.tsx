import Link from "next/link";
import { TagPicker } from "@/components/shared/tag-picker";
import { Button, buttonVariants } from "@/components/ui/button";
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

const CONTROL = "h-11 rounded-[10px] bg-white text-base md:text-sm";
const SELECT_WRAPPER = "w-full";
const SELECT_CONTROL = "[&_select]:h-11 [&_select]:rounded-[10px] [&_select]:bg-white [&_select]:text-base md:[&_select]:text-sm";

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
      <Label htmlFor={htmlFor} className="text-xs font-medium text-[#535E56]">
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
      role="search"
      aria-label="Buscar y filtrar proyectos"
      method="get"
      action="/projects"
      className="flex flex-col gap-4 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Field label="Buscar" htmlFor="catalog-q" className="md:col-span-2 lg:col-span-5">
          <Input
            id="catalog-q"
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={80}
            placeholder="Título, descripción o tecnología"
            className={CONTROL}
          />
        </Field>

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

        <Field label="Ordenar por" htmlFor="catalog-sort" className="md:col-span-2 lg:col-span-2">
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

      <details open={query.technologies.length > 0} className="group rounded-[10px] border border-[#E3E8E3] p-3">
        <summary
          className={cn(
            "cursor-pointer rounded-sm text-sm font-medium text-[#202522] outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40",
          )}
        >
          Tecnologías
          {query.technologies.length > 0 ? ` (${query.technologies.length})` : ""}
        </summary>
        <TagPicker
          name="tech"
          legend="Tecnologías"
          options={technologies.map((tech) => ({ value: tech.slug, label: tech.name }))}
          defaultSelected={query.technologies}
          hint="Se muestran proyectos que usan todas las tecnologías elegidas (máx. 5)"
          className="mt-3"
        />
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-[10px] bg-[#183D30] px-5 text-white hover:bg-[#183D30]/90"
        >
          Aplicar
        </Button>
        <Link
          href={clearHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-11 rounded-[10px] px-5",
          )}
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
