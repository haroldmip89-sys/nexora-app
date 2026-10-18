import type { Metadata } from "next";
import Link from "next/link";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { DeveloperProfileForm } from "@/modules/profile/components/developer-profile-form";
import { PayoutsLinkCard } from "@/modules/profile/components/payouts-link-card";
import { getInitials } from "@/modules/profile/services/avatar-initials";
import { getOwnProfile } from "@/modules/profile/services/developer-profile.service";
import { RatingSummary } from "@/modules/ratings/components/rating-summary";
import { getDeveloperRatingSummary } from "@/modules/ratings/services/rating.service";

export const metadata: Metadata = { title: "Mi cuenta | Nexora" };

export default async function AccountPage() {
  let actorId: string;
  let profile;
  let summary;
  try {
    const actor = await requireRole("developer");
    actorId = actor.id;
    profile = await getOwnProfile(actor);
    summary = await getDeveloperRatingSummary(actorId);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">Mi cuenta</h1>
        <Link
          href={`/developers/${actorId}`}
          className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-[#183D30] underline outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
        >
          Ver perfil público
        </Link>
      </div>
      <div className="flex flex-col gap-6">
        <DeveloperProfileForm
          profile={profile}
          initials={getInitials(profile.displayName)}
          ratingSlot={<RatingSummary summary={summary} developerId={actorId} />}
        />
        <PayoutsLinkCard />
      </div>
    </main>
  );
}
