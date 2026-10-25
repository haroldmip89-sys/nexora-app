"use client";

import { useCallback, useState } from "react";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import { ProposalForm } from "@/modules/proposals/components/proposal-form";
import { ProposalStatusBadge } from "@/modules/proposals/components/proposal-status-badge";
import { WithdrawProposalButton } from "@/modules/proposals/components/withdraw-proposal-button";
import type { DeveloperProposal } from "@/modules/proposals/types/proposal.types";

const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

export function OwnProposalCard({ proposal }: { proposal: DeveloperProposal }) {
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);
  const isPending = proposal.status === "pending";

  if (editing && isPending) {
    return <ProposalForm mode="edit" proposal={proposal} onDone={stopEditing} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Tu propuesta</span>
        <ProposalStatusBadge status={proposal.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Precio</dt>
          <dd className="font-semibold text-foreground">{formatUsd(proposal.priceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Plazo</dt>
          <dd className="text-foreground">{proposal.timelineWeeks} semanas</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground">Enviada</dt>
          <dd className="text-foreground">{dateFormatter.format(proposal.createdAt)}</dd>
        </div>
      </dl>

      <MarkdownContent
        source={proposal.description}
        className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      />

      {isPending ? (
        <div className="flex flex-wrap items-start gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-11 rounded-[10px] px-4"
          >
            Editar
          </Button>
          <WithdrawProposalButton proposalId={proposal.id} className="h-11 rounded-[10px] px-4" />
        </div>
      ) : null}

      {proposal.status === "withdrawn" ? (
        <p className="text-sm text-muted-foreground">
          Retiraste esta propuesta. No es posible enviar otra a este proyecto.
        </p>
      ) : null}
    </div>
  );
}
