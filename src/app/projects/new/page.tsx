import type { Metadata } from "next";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ProjectForm } from "@/modules/projects/components/project-form";
import { listTechnologies } from "@/modules/projects/services/technology.service";

export const metadata: Metadata = { title: "Publicar proyecto | Nexora" };

export default async function NewProjectPage() {
  try {
    await requireRole("client");
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  const technologies = await listTechnologies();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Publicar proyecto</h1>
      <p className="mt-2 mb-6 text-sm text-[#535E56]">
        Describe lo que necesitas. Puedes guardarlo como borrador o publicarlo para recibir propuestas.
      </p>
      <div className="rounded-2xl border border-[#E3E8E3] bg-white p-5 sm:p-6">
        <ProjectForm technologies={technologies} />
      </div>
    </main>
  );
}
