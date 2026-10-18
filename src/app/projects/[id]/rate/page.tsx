import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { RateDeveloperForm } from "@/modules/ratings/components/rate-developer-form";
import { getProjectRatingView } from "@/modules/ratings/services/rating.service";

export const metadata: Metadata = { title: "Valorar al desarrollador | Nexora" };

type Props = { params: Promise<{ id: string }> };

export default async function RateDeveloperPage({ params }: Props) {
  const { id } = await params;
  // Malformed ids are indistinguishable from missing ones (404, no DB access).
  if (!z.uuid().safeParse(id).success) notFound();

  let view;
  try {
    const user = await requireRole("client");
    view = await getProjectRatingView(user, id);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return <RateDeveloperForm view={view} />;
}
