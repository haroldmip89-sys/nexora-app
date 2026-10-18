import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { getMyProject } from "@/modules/projects/services/project.service";
import { ProjectProposalsView } from "@/modules/proposals/components/project-proposals-view";
import { projectProposalsQuerySchema } from "@/modules/proposals/schemas/proposal.schema";
import {
  getProjectProposal,
  listProjectProposals,
} from "@/modules/proposals/services/proposal.service";
import type { ClientProposalDetail } from "@/modules/proposals/types/proposal.types";

export const metadata: Metadata = { title: "Propuestas recibidas | Nexora" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectProposalsPage({ params, searchParams }: Props) {
  const { id } = await params;
  // Malformed ids are indistinguishable from missing ones (404, no DB access).
  if (!z.uuid().safeParse(id).success) notFound();
  // Invalid or missing params fall back to defaults (.catch in the schema).
  const query = projectProposalsQuerySchema.parse(await searchParams);

  let project;
  let data;
  let detail: ClientProposalDetail | null = null;
  try {
    const user = await requireRole("client");
    project = await getMyProject(user, id);
    data = await listProjectProposals(user, id, query);
    if (query.proposal) {
      try {
        detail = await getProjectProposal(user, id, query.proposal);
      } catch (error) {
        // An unknown, foreign or withdrawn proposal just hides the panel.
        if (!(error instanceof AuthError && error.code === "NOT_FOUND")) throw error;
      }
    }
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return (
    <ProjectProposalsView
      project={{ id: project.id, title: project.title, status: project.status }}
      data={data}
      query={query}
      detail={detail}
    />
  );
}
