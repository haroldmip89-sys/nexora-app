import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicCatalogFilters } from "@/modules/projects/components/public-catalog-filters";
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
    console.error("listTechnologies failed", error);
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[#202522] sm:text-3xl">
        Explorar proyectos
      </h1>
      <div className="mt-6 mb-6">
        <PublicCatalogFilters query={query} technologies={technologies} />
      </div>
      <Suspense key={JSON.stringify(query)} fallback={<PublicCatalogSkeleton />}>
        <PublicCatalogResults query={query} />
      </Suspense>
    </main>
  );
}
