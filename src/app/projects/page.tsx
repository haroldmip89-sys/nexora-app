import type { Metadata } from "next";
import { Suspense } from "react";
import { safeErrorLog } from "@/lib/safe-error-log";
import { PublicCatalogFilters } from "@/modules/projects/components/public-catalog-filters";
import { PublicCatalogHero } from "@/modules/projects/components/public-catalog-hero";
import { PublicCatalogResults } from "@/modules/projects/components/public-catalog-results";
import { PublicCatalogSkeleton } from "@/modules/projects/components/public-catalog-skeleton";
import { parsePublicCatalogQuery } from "@/modules/projects/schemas/public-catalog.schema";
import { listTechnologies } from "@/modules/projects/services/technology.service";
import type { TechnologyOption } from "@/modules/projects/types/project.types";

export const metadata: Metadata = {
  title: "Proyectos de desarrollo web | Nexora",
  description:
    "Explora proyectos de desarrollo web publicados por clientes y encuentra oportunidades para enviar tu propuesta.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PublicProjectsPage({ searchParams }: Props) {
  // Invalid or missing params fall back to defaults (.catch in the schema).
  const query = parsePublicCatalogQuery(await searchParams);

  // The catalog must not fail if the tag catalog does.
  let technologies: TechnologyOption[] = [];
  try {
    technologies = await listTechnologies();
  } catch (error) {
    console.error("listTechnologies failed", safeErrorLog(error));
  }

  return (
    <main className="flex-1">
      <PublicCatalogHero query={query} />
      <div className="mx-auto flex w-full max-w-page flex-col items-stretch gap-6 px-4 pt-8 pb-16 sm:px-6 lg:flex-row lg:items-start">
        <aside className="w-full min-w-0 lg:w-[280px] lg:shrink-0">
          <PublicCatalogFilters query={query} technologies={technologies} />
        </aside>
        <div className="min-w-0 flex-1">
          <Suspense key={JSON.stringify(query)} fallback={<PublicCatalogSkeleton />}>
            <PublicCatalogResults query={query} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
