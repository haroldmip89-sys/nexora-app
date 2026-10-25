import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { DeveloperProfileView } from "@/modules/profile/components/developer-profile-view";
import { getPublicDeveloperProfile } from "@/modules/profile/services/developer-profile.service";
import { RatingList } from "@/modules/ratings/components/rating-list";
import { getDeveloperRatingSummary, listDeveloperRatings } from "@/modules/ratings/services/rating.service";

type Props = { params: Promise<{ id: string }> };

// Deduplicates the query between generateMetadata and the page within one request.
const loadProfile = cache(async (id: string) => {
  const viewer = await getCurrentUser();
  const profile = await getPublicDeveloperProfile(
    id,
    viewer ? { id: viewer.id, role: viewer.role } : null,
  );
  return { viewer, profile };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { profile } = await loadProfile(id);
  if (!profile) return { title: "Perfil no encontrado | Nexora" };
  return { title: `${profile.displayName} | Nexora` };
}

export default async function DeveloperProfilePage({ params }: Props) {
  const { id } = await params;
  const { viewer, profile } = await loadProfile(id);
  if (!profile) notFound();

  const [summary, ratings] = await Promise.all([
    getDeveloperRatingSummary(profile.userId),
    listDeveloperRatings(profile.userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <DeveloperProfileView
        profile={profile}
        isOwner={viewer?.id === profile.userId}
        viewerRole={viewer?.role ?? null}
        rating={summary}
        reviewsSlot={<RatingList ratings={ratings} />}
      />
    </main>
  );
}
