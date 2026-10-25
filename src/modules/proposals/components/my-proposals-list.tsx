import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProposalStatusBadge } from "@/modules/proposals/components/proposal-status-badge";
import { WithdrawProposalButton } from "@/modules/proposals/components/withdraw-proposal-button";
import { MY_PROPOSALS_STATUSES } from "@/modules/proposals/schemas/proposal.schema";
import {
  PROPOSAL_STATUS_LABELS,
  type MyProposalsPage,
  type MyProposalsQuery,
} from "@/modules/proposals/types/proposal.types";

const BASE_PATH = "/dashboard/proposals";
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

function buildHref(query: MyProposalsQuery, patch: Partial<MyProposalsQuery>): string {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.status !== "all") params.set("status", next.status);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${BASE_PATH}?${qs}` : BASE_PATH;
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
        "inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-colors",
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

type Props = { data: MyProposalsPage; query: MyProposalsQuery };

export function MyProposalsList({ data, query }: Props) {
  const { items, total, page, totalPages } = data;
  const filtered = query.status !== "all";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Mis propuestas</h1>

      {total > 0 || filtered ? (
        <nav aria-label="Filtrar por estado" className="mt-5 flex flex-wrap gap-2">
          {MY_PROPOSALS_STATUSES.map((status) => (
            <Chip
              key={status}
              href={buildHref(query, { status, page: 1 })}
              active={query.status === status}
            >
              {status === "all" ? "Todas" : `${PROPOSAL_STATUS_LABELS[status]}s`}
            </Chip>
          ))}
        </nav>
      ) : null}

      <div className="mt-6">
        {items.length === 0 ? (
          total > 0 || filtered ? (
            <EmptyState
              title={filtered ? "No hay propuestas con este estado" : "No hay propuestas en esta página"}
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
              title="Aún no has enviado propuestas"
              description="Explora los proyectos publicados y envía tu primera propuesta."
              action={
                <Link
                  href="/projects"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-10 rounded-[10px] bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90",
                    FOCUS,
                  )}
                >
                  Explorar proyectos
                </Link>
              }
              className="border-[#E3E8E3] bg-white"
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((proposal) => (
              <li
                key={proposal.id}
                className="flex flex-col gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 break-words text-base font-semibold text-[#202522]">
                    {proposal.projectStatus === "published" ? (
                      <Link
                        href={`/projects/${proposal.projectId}`}
                        className={cn("rounded-sm underline", FOCUS)}
                      >
                        {proposal.projectTitle}
                      </Link>
                    ) : (
                      proposal.projectTitle
                    )}
                  </h2>
                  <ProposalStatusBadge status={proposal.status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-[#535E56]">Precio</dt>
                    <dd className="text-[#202522]">{formatUsd(proposal.priceCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#535E56]">Plazo</dt>
                    <dd className="text-[#202522]">{proposal.timelineWeeks} semanas</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#535E56]">Enviada</dt>
                    <dd className="text-[#202522]">{dateFormatter.format(proposal.createdAt)}</dd>
                  </div>
                </dl>
                {proposal.status === "pending" ? (
                  <div className="flex flex-wrap items-start gap-2 border-t border-[#E3E8E3] pt-3">
                    <Link
                      href={`/projects/${proposal.projectId}#propuesta`}
                      className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3", FOCUS)}
                    >
                      Editar
                    </Link>
                    <WithdrawProposalButton proposalId={proposal.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PaginationNav page={page} totalPages={totalPages} buildHref={(p) => buildHref(query, { page: p })} />
    </main>
  );
}
