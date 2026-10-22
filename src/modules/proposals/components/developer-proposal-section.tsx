import Link from "next/link";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { formatBudgetRange } from "@/modules/projects/components/public-project-card";
import { getPublicProject } from "@/modules/projects/services/public-catalog.service";
import { OwnProposalCard } from "@/modules/proposals/components/own-proposal-card";
import { ProposalForm } from "@/modules/proposals/components/proposal-form";
import { getMyProposalForProject, hasActivePayouts } from "@/modules/proposals/services/proposal.service";
import type { DeveloperProposal } from "@/modules/proposals/types/proposal.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#535E56]">{children}</p>;
}

/**
 * Developer branch of the public detail CTA: create form or own proposal.
 * Never breaks the public page: unexpected failures degrade to a note.
 */
export async function DeveloperProposalSection({ projectId }: { projectId: string }) {
  let proposal: DeveloperProposal | null = null;
  let budgetHint: string | undefined;
  let payoutsReady = true;

  try {
    const actor = await getCurrentUser();
    if (!actor) return null;
    proposal = await getMyProposalForProject(actor, projectId);
    if (!proposal) {
      payoutsReady = await hasActivePayouts(actor);
      const project = await getPublicProject(projectId);
      if (project) {
        budgetHint = formatBudgetRange(project.budgetMinCents, project.budgetMaxCents);
      }
    }
  } catch {
    return <Note>No pudimos cargar tu propuesta. Recarga la página para intentarlo de nuevo.</Note>;
  }

  return (
    <section id="propuesta" aria-labelledby="propuesta-title" className="flex flex-col gap-4">
      <h2 id="propuesta-title" className="text-base font-semibold text-[#202522]">
        {proposal ? "Tu propuesta" : "Enviar una propuesta"}
      </h2>
      {proposal ? (
        <OwnProposalCard proposal={proposal} />
      ) : !payoutsReady ? (
        <p className="rounded-[10px] bg-[#DCE6DE] p-3 text-sm text-[#183D30]">
          Para enviar propuestas debes configurar tus cobros de prueba.{" "}
          <Link href="/dashboard/payouts" className={`rounded-sm font-medium underline ${FOCUS}`}>
            Configurar cobros de prueba
          </Link>
        </p>
      ) : (
        <ProposalForm mode="create" projectId={projectId} budgetHint={budgetHint} />
      )}
      <Link
        href="/dashboard/proposals"
        className={`w-fit rounded-sm text-sm font-medium text-[#183D30] underline ${FOCUS}`}
      >
        Mis propuestas
      </Link>
    </section>
  );
}
