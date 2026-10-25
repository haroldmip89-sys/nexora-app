import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { ProjectLifecycleActions } from "@/modules/projects/components/project-lifecycle-actions";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";
import { getMyProject } from "@/modules/projects/services/project.service";
import { listTechnologies } from "@/modules/projects/services/technology.service";

export const metadata: Metadata = { title: "Editar proyecto | Nexora" };

type Props = { params: Promise<{ id: string }> };

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;
  // Malformed ids are indistinguishable from missing ones (404, no DB access).
  if (!z.uuid().safeParse(id).success) notFound();

  let project;
  try {
    const user = await requireRole("client");
    project = await getMyProject(user, id);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  const technologies = await listTechnologies();

  return (
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-foreground">
            Editar proyecto
          </h1>
          <p className="mt-1 break-words text-[15px] text-muted-foreground">
            {project.status === "draft"
              ? "Borrador · los cambios se ven en el catálogo al publicar."
              : project.title}
          </p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="mt-4">
        <ProjectLifecycleActions
          projectId={project.id}
          status={project.status}
          proposalCount={project.proposalCount}
        />
      </div>
      <div className="mt-6">
        <ProjectForm project={project} technologies={technologies} />
      </div>
    </main>
  );
}
