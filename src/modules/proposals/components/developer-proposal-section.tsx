import Link from "next/link";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { formatBudgetRange } from "@/modules/projects/components/public-project-card";
import { getPublicProject } from "@/modules/projects/services/public-catalog.service";
import { OwnProposalCard } from "@/modules/proposals/components/own-proposal-card";
import { ProposalForm } from "@/modules/proposals/components/proposal-form";
import { getMyProposalForProject, hasActivePayouts } from "@/modules/proposals/services/proposal.service";
import type { DeveloperProposal } from "@/modules/proposals/types/proposal.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

function Note({ children }: { children: React.ReactNode }) {
  return <p className="surface p-5 text-sm text-muted-foreground">{children}</p>;
}

/**
 * Developer proposal section of the public detail (main column): create form
 * or own proposal. Never breaks the public page: unexpected failures degrade
 * to a note.
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
    <section
      id="propuesta"
      aria-labelledby="propuesta-title"
      className="surface flex scroll-mt-24 flex-col gap-4 p-5 sm:p-8"
    >
      <h2 id="propuesta-title" className="text-xl font-extrabold text-foreground">
        {proposal ? "Tu propuesta" : "Enviar una propuesta"}
      </h2>
      {proposal ? (
        <OwnProposalCard proposal={proposal} />
      ) : !payoutsReady ? (
        <p className="rounded-[10px] border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
          Para enviar propuestas debes configurar tus cobros de prueba.{" "}
          <Link href="/dashboard/payouts" className={`rounded-sm font-bold underline ${FOCUS}`}>
            Configurar cobros de prueba
          </Link>
        </p>
      ) : (
        <ProposalForm mode="create" projectId={projectId} budgetHint={budgetHint} />
      )}
      <Link
        href="/dashboard/proposals"
        className={`inline-flex min-h-11 w-fit items-center rounded-sm text-sm font-bold text-primary underline ${FOCUS}`}
      >
        Mis propuestas
      </Link>
    </section>
  );
}
