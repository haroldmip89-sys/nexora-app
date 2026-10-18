import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { buttonVariants } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { ClientProposalDetail } from "@/modules/proposals/components/client-proposal-detail";
import { ProposalStatusBadge } from "@/modules/proposals/components/proposal-status-badge";
import type {
  ClientProposalDetail as ClientProposalDetailData,
  ProjectProposalsPage,
  ProjectProposalsQuery,
} from "@/modules/proposals/types/proposal.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

const SORT_OPTIONS: { value: ProjectProposalsQuery["sort"]; label: string }[] = [
  { value: "recent", label: "Más recientes" },
  { value: "price_asc", label: "Menor precio" },
  { value: "timeline_asc", label: "Menor plazo" },
];

function buildHref(
  projectId: string,
  query: ProjectProposalsQuery,
  patch: Partial<ProjectProposalsQuery>,
): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.sort !== "recent") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.proposal) params.set("proposal", next.proposal);
  const qs = params.toString();
  const base = `/projects/${projectId}/proposals`;
  return qs ? `${base}?${qs}` : base;
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

type Props = {
  project: { id: string; title: string; status: ProjectStatus };
  data: ProjectProposalsPage;
  query: ProjectProposalsQuery;
  detail: ClientProposalDetailData | null;
};

export function ProjectProposalsView({ project, data, query, detail }: Props) {
  const { items, total, page, totalPages } = data;
  const selectedId = detail?.id ?? null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/projects"
        className={cn("text-sm font-medium text-[#183D30] underline", FOCUS)}
      >
        Volver a mis proyectos
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#535E56]">Propuestas recibidas</p>
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-[#202522]">
            {project.title}
          </h1>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      {project.status === "proposal_selected" ? (
        <div
          role="status"
          className="mt-4 rounded-[14px] border border-[#DCE6DE] bg-[#F5F6F2] p-4 text-sm text-[#202522]"
        >
          <p>
            Elegiste una propuesta. Este proyecto ya no admite nuevas propuestas y las demás
            quedaron rechazadas. El siguiente paso es el pago de prueba (Test Mode).
          </p>
          <Link
            href={`/projects/${project.id}/payment`}
            className={cn(
              buttonVariants(),
              "mt-3 h-10 bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90",
              FOCUS,
            )}
          >
            Continuar al pago de prueba
          </Link>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-6">
          {total > 0 ? (
            <EmptyState
              title="No hay propuestas en esta página"
              action={
                <Link
                  href={buildHref(project.id, query, { page: 1, proposal: undefined })}
                  className={cn("text-sm font-medium text-[#183D30] underline", FOCUS)}
                >
                  Volver al inicio de la lista
                </Link>
              }
              className="border-[#E3E8E3] bg-white"
            />
          ) : (
            <EmptyState
              title="Aún no hay propuestas"
              description="Cuando un desarrollador envíe una propuesta, la verás aquí."
              className="border-[#E3E8E3] bg-white"
            />
          )}
        </div>
      ) : (
        <>
          <nav aria-label="Ordenar" className="mt-5 flex flex-wrap gap-2">
            {SORT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                href={buildHref(project.id, query, { sort: option.value, page: 1 })}
                active={query.sort === option.value}
              >
                {option.label}
              </Chip>
            ))}
          </nav>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <div
              role="region"
              aria-label="Tabla comparativa de propuestas"
              tabIndex={0}
              className={cn(
                "min-w-0 overflow-x-auto rounded-[14px] border border-[#E3E8E3] bg-white",
                FOCUS,
              )}
            >
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <caption className="px-4 py-3 text-left text-sm text-[#535E56]">
                  Propuestas recibidas para este proyecto
                </caption>
                <thead>
                  <tr className="border-y border-[#E3E8E3] bg-[#F5F6F2] text-xs text-[#535E56]">
                    <th scope="col" className="px-4 py-2 font-medium">Desarrollador</th>
                    <th scope="col" className="px-4 py-2 font-medium">Precio</th>
                    <th scope="col" className="px-4 py-2 font-medium">Plazo</th>
                    <th scope="col" className="px-4 py-2 font-medium">Enviada</th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((proposal) => (
                    <tr
                      key={proposal.id}
                      className={cn(
                        "border-b border-[#E3E8E3] last:border-b-0",
                        proposal.id === selectedId && "bg-[#F5F6F2]",
                      )}
                    >
                      <th scope="row" className="px-4 py-3 font-medium text-[#202522]">
                        <span className="break-words">{proposal.developerName}</span>
                        {proposal.status !== "pending" ? (
                          <ProposalStatusBadge status={proposal.status} className="ml-2" />
                        ) : null}
                      </th>
                      <td className="whitespace-nowrap px-4 py-3 text-[#202522]">
                        {formatUsd(proposal.priceCents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#202522]">
                        {proposal.timelineWeeks} semanas
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[#202522]">
                        {dateFormatter.format(proposal.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={buildHref(project.id, query, { proposal: proposal.id })}
                          aria-current={proposal.id === selectedId ? "true" : undefined}
                          className={cn("font-medium text-[#183D30] underline", FOCUS)}
                        >
                          Ver detalle
                          <span className="sr-only"> de {proposal.developerName}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ClientProposalDetail
              proposal={detail}
              projectId={project.id}
              projectStatus={project.status}
            />
          </div>

          <PaginationNav
            page={page}
            totalPages={totalPages}
            buildHref={(target) => buildHref(project.id, query, { page: target })}
          />
        </>
      )}
    </main>
  );
}
