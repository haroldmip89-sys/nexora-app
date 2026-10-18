"use client";

import { useCallback, useState } from "react";
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
        <span className="text-sm font-medium text-[#202522]">Tu propuesta</span>
        <ProposalStatusBadge status={proposal.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[#535E56]">Precio</dt>
          <dd className="font-semibold text-[#202522]">{formatUsd(proposal.priceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#535E56]">Plazo</dt>
          <dd className="text-[#202522]">{proposal.timelineWeeks} semanas</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-[#535E56]">Enviada</dt>
          <dd className="text-[#202522]">{dateFormatter.format(proposal.createdAt)}</dd>
        </div>
      </dl>

      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-[#202522]">
        {proposal.description}
      </p>

      {isPending ? (
        <div className="flex flex-wrap items-start gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-10 rounded-[10px] px-4"
          >
            Editar
          </Button>
          <WithdrawProposalButton proposalId={proposal.id} className="h-10 rounded-[10px] px-4" />
        </div>
      ) : null}

      {proposal.status === "withdrawn" ? (
        <p className="text-sm text-[#535E56]">
          Retiraste esta propuesta. No es posible enviar otra a este proyecto.
        </p>
      ) : null}
    </div>
  );
}
