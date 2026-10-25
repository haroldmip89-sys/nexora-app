import { DeveloperProfileLink } from "@/components/shared/developer-profile-link";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
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
        "inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors",
        FOCUS,
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <Breadcrumb aria-label="Ruta">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard" className={cn("rounded-sm", FOCUS)} />}>
              Mi panel
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href={`/projects/${project.id}`} className={cn("rounded-sm", FOCUS)} />}
            >
              {project.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Propuestas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight text-foreground">
            Propuestas recibidas
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{project.title}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      {project.status === "proposal_selected" ? (
        <div
          role="status"
          className="mt-4 rounded-[14px] border border-border bg-surface-soft p-4 text-sm text-foreground"
        >
          <p>
            Elegiste una propuesta. Este proyecto ya no admite nuevas propuestas y las demás
            quedaron rechazadas. El siguiente paso es el pago de prueba (Test Mode).
          </p>
          <Link
            href={`/projects/${project.id}/payment`}
            className={cn(
              buttonVariants({ size: "touch" }),
              "mt-3",
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
                  className={cn("text-sm font-medium text-primary underline", FOCUS)}
                >
                  Volver al inicio de la lista
                </Link>
              }
              className="border-border bg-card"
            />
          ) : (
            <EmptyState
              title="Aún no hay propuestas"
              description="Cuando un desarrollador envíe una propuesta, la verás aquí."
              className="border-border bg-card"
            />
          )}
        </div>
      ) : (
        <>
          <nav
            aria-label="Ordenar"
            className="mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1"
          >
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
              className={cn("surface min-w-0 overflow-x-auto", FOCUS)}
            >
              <table className="w-full min-w-[34rem] caption-top text-left text-sm">
                <caption className="px-4 py-3 text-left text-sm text-muted-foreground">
                  Propuestas recibidas para este proyecto
                </caption>
                <TableHeader>
                  <TableRow className="border-y border-border bg-surface-subtle text-xs text-muted-foreground hover:bg-surface-subtle">
                    <TableHead scope="col" className="px-4 text-muted-foreground">Desarrollador</TableHead>
                    <TableHead scope="col" className="px-4 text-right text-muted-foreground">Precio</TableHead>
                    <TableHead scope="col" className="px-4 text-muted-foreground">Plazo</TableHead>
                    <TableHead scope="col" className="px-4 text-muted-foreground">Enviada</TableHead>
                    <TableHead scope="col" className="px-4">
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((proposal) => {
                    const selected = proposal.id === selectedId;
                    return (
                      <TableRow
                        key={proposal.id}
                        className={cn(
                          "border-border",
                          selected && "bg-surface-soft shadow-[inset_3px_0_0_var(--primary)]",
                        )}
                      >
                        <TableHead scope="row" className="h-auto whitespace-normal px-4 py-3 text-foreground">
                          <span className="flex items-center gap-2.5">
                            <UserAvatar name={proposal.developerName} imageUrl={proposal.imageUrl} size="sm" />
                            <span className="min-w-0">
                              <DeveloperProfileLink
                                developerId={proposal.developerId}
                                name={proposal.developerName}
                              />
                              {proposal.status !== "pending" ? (
                                <ProposalStatusBadge status={proposal.status} className="ml-2" />
                              ) : null}
                            </span>
                          </span>
                        </TableHead>
                        <TableCell className="px-4 py-3 text-right text-[15px] font-extrabold text-foreground">
                          {formatUsd(proposal.priceCents)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-foreground">
                          {proposal.timelineWeeks} semanas
                        </TableCell>
                        <TableCell className="px-4 py-3 text-foreground">
                          {dateFormatter.format(proposal.createdAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Link
                            href={buildHref(project.id, query, { proposal: proposal.id })}
                            aria-current={selected ? "true" : undefined}
                            className={cn(
                              buttonVariants({ variant: selected ? "default" : "outline" }),
                              "h-10 px-3 font-medium",
                              FOCUS,
                            )}
                          >
                            {selected ? "Viendo" : "Ver detalle"}
                            <span className="sr-only"> de {proposal.developerName}</span>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
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
