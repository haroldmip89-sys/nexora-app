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
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-foreground">
        Publicar proyecto
      </h1>
      <p className="mt-1 mb-6 text-[15px] text-muted-foreground">
        Describe lo que necesitas. Puedes guardarlo como borrador o publicarlo para recibir propuestas.
      </p>
      <ProjectForm technologies={technologies} />
    </main>
  );
}
