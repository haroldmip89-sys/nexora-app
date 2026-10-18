import { formatUsd } from "@/lib/money";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { ProposalStatusBadge } from "@/modules/proposals/components/proposal-status-badge";
import { SelectProposalButton } from "@/modules/proposals/components/select-proposal-button";
import type { ClientProposalDetail as ClientProposalDetailData } from "@/modules/proposals/types/proposal.types";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

type Props = {
  proposal: ClientProposalDetailData | null;
  projectId: string;
  projectStatus: ProjectStatus;
};

/** Detail panel of the proposals comparison page; shows no contact data. */
export function ClientProposalDetail({ proposal, projectId, projectStatus }: Props) {
  return (
    <section
      aria-labelledby="proposal-detail-heading"
      className="min-w-0 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
    >
      <h2 id="proposal-detail-heading" className="text-base font-semibold text-[#202522]">
        Detalle de la propuesta
      </h2>

      {proposal ? (
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-lg font-semibold text-[#202522]">
              {proposal.developerName}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {proposal.updatedAt > proposal.createdAt ? (
                <span className="text-xs text-[#535E56]">Editada</span>
              ) : null}
              <ProposalStatusBadge status={proposal.status} />
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[420px]:grid-cols-3">
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
          <div>
            <h3 className="text-xs text-[#535E56]">Descripción</h3>
            <p className="mt-1 whitespace-pre-line break-words text-sm text-[#202522]">
              {proposal.description}
            </p>
          </div>
          {projectStatus === "published" && proposal.status === "pending" ? (
            <div>
              <SelectProposalButton
                projectId={projectId}
                proposalId={proposal.id}
                developerName={proposal.developerName}
                seenUpdatedAt={proposal.updatedAt.toISOString()}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#535E56]">
          Elige una propuesta de la tabla con &laquo;Ver detalle&raquo; para ver su descripción
          completa.
        </p>
      )}
    </section>
  );
}
