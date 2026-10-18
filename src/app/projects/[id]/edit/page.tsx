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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-[#202522]">
          {project.title}
        </h1>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="mt-4">
        <ProjectLifecycleActions
          projectId={project.id}
          status={project.status}
          proposalCount={project.proposalCount}
        />
      </div>
      <div className="mt-6 rounded-2xl border border-[#E3E8E3] bg-white p-5 sm:p-6">
        <ProjectForm project={project} technologies={technologies} />
      </div>
    </main>
  );
}
