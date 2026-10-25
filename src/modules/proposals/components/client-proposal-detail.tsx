import { DeveloperProfileLink } from "@/components/shared/developer-profile-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MarkdownContent } from "@/components/shared/markdown-content";
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
      className="surface min-w-0 overflow-hidden"
    >
      <h2 id="proposal-detail-heading" className="px-4 pt-4 text-base font-semibold text-foreground sm:px-5 sm:pt-5">
        Detalle de la propuesta
      </h2>

      {proposal ? (
        <>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={proposal.developerName} imageUrl={proposal.imageUrl} size="lg" />
                <p className="min-w-0 break-words text-lg font-semibold text-foreground">
                  <DeveloperProfileLink
                    developerId={proposal.developerId}
                    name={proposal.developerName}
                  />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {proposal.updatedAt > proposal.createdAt ? (
                  <span className="text-xs text-muted-foreground">Editada</span>
                ) : null}
                <ProposalStatusBadge status={proposal.status} />
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-surface-subtle p-3 text-sm min-[420px]:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Precio</dt>
                <dd className="font-semibold text-foreground">{formatUsd(proposal.priceCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Plazo</dt>
                <dd className="text-foreground">{proposal.timelineWeeks} semanas</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Enviada</dt>
                <dd className="text-foreground">{dateFormatter.format(proposal.createdAt)}</dd>
              </div>
            </dl>
            <div>
              <h3 className="text-xs text-muted-foreground">Descripción</h3>
              <MarkdownContent
                source={proposal.description}
                className="mt-1 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            </div>
          </div>
          {projectStatus === "published" && proposal.status === "pending" ? (
            <div className="flex flex-col gap-2 border-t border-divider bg-surface-subtle p-4 sm:p-5">
              <SelectProposalButton
                projectId={projectId}
                proposalId={proposal.id}
                developerName={proposal.developerName}
                seenUpdatedAt={proposal.updatedAt.toISOString()}
              />
              <p className="text-xs text-muted-foreground">
                Al seleccionarla, las demás propuestas se rechazan y podrás hacer el pago de prueba.
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="p-4 text-sm text-muted-foreground sm:p-5">
          Elige una propuesta de la tabla con &laquo;Ver detalle&raquo; para ver su descripción
          completa.
        </p>
      )}
    </section>
  );
}
