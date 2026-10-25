import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { summarizeMarkdown } from "@/lib/markdown";
import { PublicProjectDetail } from "@/modules/projects/components/public-project-detail";
import { getPublicProject } from "@/modules/projects/services/public-catalog.service";
import { resolvePublicViewer } from "@/modules/projects/services/public-viewer.service";

type Props = { params: Promise<{ id: string }> };

const DESCRIPTION_LENGTH = 160;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // Same cached call as the page; identical title for missing/unpublished/invalid.
  const project = await getPublicProject(id);
  if (!project) return { title: "Proyecto no encontrado | Nexora" };

  const title = `${project.title} | Nexora`;
  const description = summarizeMarkdown(project.description, DESCRIPTION_LENGTH);

  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function PublicProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await getPublicProject(id);
  if (!project) notFound();

  const viewer = await resolvePublicViewer(project.id);

  return (
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <PublicProjectDetail project={project} viewer={viewer} />
    </main>
  );
}
