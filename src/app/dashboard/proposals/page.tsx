import type { Metadata } from "next";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { MyProposalsList } from "@/modules/proposals/components/my-proposals-list";
import { myProposalsQuerySchema } from "@/modules/proposals/schemas/proposal.schema";
import { listMyProposals } from "@/modules/proposals/services/proposal.service";

export const metadata: Metadata = { title: "Mis propuestas | Nexora" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MyProposalsPage({ searchParams }: Props) {
  // Invalid or missing params fall back to defaults (.catch in the schema).
  const query = myProposalsQuerySchema.parse(await searchParams);

  let data;
  try {
    const user = await requireRole("developer");
    data = await listMyProposals(user, query);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return <MyProposalsList data={data} query={query} />;
}
