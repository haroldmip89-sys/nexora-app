import type { Metadata } from "next";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ProjectList } from "@/modules/projects/components/project-list";
import { projectListQuerySchema } from "@/modules/projects/schemas/project.schema";
import { listMyProjects } from "@/modules/projects/services/project.service";

export const metadata: Metadata = { title: "Mis proyectos | Nexora" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MyProjectsPage({ searchParams }: Props) {
  // Invalid or missing params fall back to defaults (.catch in the schema).
  const query = projectListQuerySchema.parse(await searchParams);

  let data;
  try {
    const user = await requireRole("client");
    data = await listMyProjects(user, query);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return <ProjectList data={data} query={query} />;
}
