import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProjectLifecycleActions } from "@/modules/projects/components/project-lifecycle-actions";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { PROJECT_LIST_STATUSES } from "@/modules/projects/schemas/project.schema";
import {
  PROJECT_STATUS_LABELS,
  type ProjectListQuery,
  type ProjectPage,
  type ProjectStatus,
} from "@/modules/projects/types/project.types";

const BASE_PATH = "/dashboard/projects";
const PRIMARY_LINK = "bg-[#183D30] text-white hover:bg-[#183D30]/90";
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";

const PROPOSALS_VISIBLE_STATUSES: readonly ProjectStatus[] = [
  "published",
  "proposal_selected",
  "contracted",
  "closed",
];

function buildHref(query: ProjectListQuery, patch: Partial<ProjectListQuery>): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.status !== "all") params.set("status", next.status);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
}

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

function NewProjectLink({ label = "Nuevo proyecto" }: { label?: string }) {
  return (
    <Link
      href="/projects/new"
      className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-[10px] px-4", PRIMARY_LINK)}
    >
      {label}
    </Link>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors",
        FOCUS,
        active
          ? "border-[#183D30] bg-[#183D30] font-medium text-white"
          : "border-[#E3E8E3] bg-white text-[#535E56] hover:border-[#183D30]/50",
      )}
    >
      {children}
    </Link>
  );
}

type Props = { data: ProjectPage; query: ProjectListQuery };

export function ProjectList({ data, query }: Props) {
  const { items, total, page, totalPages } = data;
  const filtered = query.status !== "all";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Mis proyectos</h1>
        {total > 0 || filtered ? <NewProjectLink /> : null}
      </div>

      {total > 0 || filtered ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            {PROJECT_LIST_STATUSES.map((status) => (
              <Chip
                key={status}
                href={buildHref(query, { status, page: 1 })}
                active={query.status === status}
              >
                {status === "all" ? "Todos" : PROJECT_STATUS_LABELS[status]}
              </Chip>
            ))}
          </nav>
          <nav aria-label="Ordenar" className="flex gap-2">
            <Chip href={buildHref(query, { sort: "newest", page: 1 })} active={query.sort === "newest"}>
              Más recientes
            </Chip>
            <Chip href={buildHref(query, { sort: "oldest", page: 1 })} active={query.sort === "oldest"}>
              Más antiguos
            </Chip>
          </nav>
        </div>
      ) : null}

      <div className="mt-6">
        {items.length === 0 ? (
          total > 0 || filtered ? (
            <EmptyState
              title={filtered ? "No hay proyectos con este estado" : "No hay proyectos en esta página"}
              action={
                <Link
                  href={buildHref(query, { status: "all", page: 1 })}
                  className={cn("text-sm font-medium text-[#183D30] underline", FOCUS)}
                >
                  {filtered ? "Quitar el filtro" : "Volver al inicio de la lista"}
                </Link>
              }
              className="border-[#E3E8E3] bg-white"
            />
          ) : (
            <EmptyState
              title="Aún no tienes proyectos"
              description="Publica tu primer proyecto y recibe propuestas de desarrolladores."
              action={<NewProjectLink label="Crear tu primer proyecto" />}
              className="border-[#E3E8E3] bg-white"
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((project) => {
              const editable = project.status === "draft" || project.status === "published";
              return (
                <li
                  key={project.id}
                  className="flex flex-col gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 break-words text-base font-semibold text-[#202522]">
                      {project.title}
                    </h2>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-[#535E56]">Categoría</dt>
                      <dd className="text-[#202522]">{project.category}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#535E56]">Presupuesto</dt>
                      <dd className="text-[#202522]">
                        {formatUsd(project.budgetMinCents)} – {formatUsd(project.budgetMaxCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#535E56]">Plazo</dt>
                      <dd className="text-[#202522]">{project.timelineWeeks} semanas</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#535E56]">Creado</dt>
                      <dd className="text-[#202522]">{dateFormatter.format(project.createdAt)}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-start gap-2 border-t border-[#E3E8E3] pt-3">
                    <Link
                      href={`/projects/${project.id}/edit`}
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "h-9 px-3",
                        FOCUS,
                      )}
                    >
                      {editable ? "Editar" : "Ver"}
                    </Link>
                    {project.proposalCount > 0 && PROPOSALS_VISIBLE_STATUSES.includes(project.status) ? (
                      <Link
                        href={`/projects/${project.id}/proposals`}
                        className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3", FOCUS)}
                      >
                        Ver propuestas
                      </Link>
                    ) : null}
                    {project.status === "proposal_selected" ? (
                      <Link
                        href={`/projects/${project.id}/payment`}
                        className={cn(buttonVariants(), "h-9 px-3", PRIMARY_LINK, FOCUS)}
                      >
                        Continuar al pago de prueba
                      </Link>
                    ) : null}
                    <ProjectLifecycleActions
                      projectId={project.id}
                      status={project.status}
                      proposalCount={project.proposalCount}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalPages > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-6 flex items-center justify-between gap-3 text-sm text-[#535E56]"
        >
          {page > 1 ? (
            <Link href={buildHref(query, { page: page - 1 })} className={cn("font-medium text-[#183D30] underline", FOCUS)}>
              Anterior
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span>
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildHref(query, { page: page + 1 })} className={cn("font-medium text-[#183D30] underline", FOCUS)}>
              Siguiente
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}
    </main>
  );
}
