import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { safeErrorLog } from "@/lib/safe-error-log";
import { cn } from "@/lib/utils";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";
import { PublicProjectCard } from "@/modules/projects/components/public-project-card";
import { PROJECT_CATEGORIES } from "@/modules/projects/schemas/project.schema";
import { buildCatalogHref, parsePublicCatalogQuery } from "@/modules/projects/schemas/public-catalog.schema";
import { listPublicProjects } from "@/modules/projects/services/public-catalog.service";
import { getProposalAction } from "@/modules/projects/services/proposal-action";
import type { PublicCatalogPage, PublicProjectSummary } from "@/modules/projects/types/public-project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const LANDING_LIMIT = 6;
const CHIP = cn(
  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold",
  FOCUS,
);

function ProjectActions({ project, viewer }: { project: PublicProjectSummary; viewer: NavViewer }) {
  const proposal = getProposalAction(viewer, project.id);
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/projects/${project.id}`}
        className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1 font-bold text-primary", FOCUS)}
      >
        Ver detalle<span className="sr-only"> de {project.title}</span>
      </Link>
      {proposal ? (
        <Link href={proposal.href} className={cn(buttonVariants({ size: "touch" }), "flex-1 gap-2 font-bold", FOCUS)}>
          {proposal.locked ? (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          ) : null}
          {proposal.label}
        </Link>
      ) : null}
    </div>
  );
}

async function ProjectsGrid({ viewer }: { viewer: NavViewer }) {
  let data: PublicCatalogPage;
  try {
    data = await listPublicProjects(parsePublicCatalogQuery({}));
  } catch (error) {
    console.error("listPublicProjects failed", safeErrorLog(error));
    return (
      <EmptyState
        title="No pudimos cargar los proyectos"
        description="Ocurrió un problema al consultar el catálogo. Inténtalo de nuevo."
        action={
          <Link href="/" className={cn("inline-flex min-h-11 items-center rounded-sm text-sm font-bold text-primary underline", FOCUS)}>
            Reintentar
          </Link>
        }
        className="border-input bg-card"
      />
    );
  }

  const items = data.items.slice(0, LANDING_LIMIT);
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aún no hay proyectos publicados"
        description="Vuelve pronto para ver nuevas oportunidades."
        className="border-input bg-card"
      />
    );
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
      {items.map((project) => (
        <li key={project.id} className="flex">
          <PublicProjectCard project={project} actions={<ProjectActions project={project} viewer={viewer} />} />
        </li>
      ))}
    </ul>
  );
}

/** Async server section: the 6 most recent public projects (default catalog query). */
export async function LandingProjects({ viewer }: { viewer: NavViewer }) {
  const query = parsePublicCatalogQuery({});
  const showNote = viewer.kind === "visitor" || viewer.kind === "needs_onboarding";

  return (
    <section id="proyectos" aria-labelledby="proy-title" className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-page flex-col gap-7 px-6 py-[72px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[640px] flex-col gap-2">
            <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Proyectos publicados</p>
            <h2 id="proy-title" className="text-3xl leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-4xl">
              Oportunidades abiertas ahora
            </h2>
            {showNote ? (
              <p className="leading-relaxed text-text-body">
                Cualquiera puede explorar los proyectos. Para enviar propuestas necesitas una cuenta de desarrollador con tus cobros de prueba configurados.
              </p>
            ) : null}
          </div>
          <Link href="/projects" className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[15px] font-bold text-primary", FOCUS)}>
            Ver todos los proyectos
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        <nav aria-label="Filtrar por categoría">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link href="/projects" className={cn(CHIP, "border-input bg-card text-primary hover:bg-secondary")}>
                Todos
              </Link>
            </li>
            {PROJECT_CATEGORIES.map((category) => (
              <li key={category}>
                <Link
                  href={buildCatalogHref(query, { category })}
                  className={cn(CHIP, "border-input bg-card text-primary hover:bg-secondary")}
                >
                  {category}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <ProjectsGrid viewer={viewer} />
      </div>
    </section>
  );
}
