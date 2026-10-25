import { Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { refreshOwnImage } from "@/modules/auth/services/own-image-sync.service";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { AccountSectionNav } from "@/modules/profile/components/account-section-nav";
import { DeveloperProfileForm } from "@/modules/profile/components/developer-profile-form";
import { PayoutsLinkCard } from "@/modules/profile/components/payouts-link-card";
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
    await refreshOwnImage(actor.clerkUserId);
    profile = await getOwnProfile(actor);
    summary = await getDeveloperRatingSummary(actorId);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return (
    <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-foreground">Mi cuenta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Así te ven los clientes cuando revisan tus propuestas.
          </p>
        </div>
        <Link
          href={`/developers/${actorId}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[10px] text-sm font-medium text-primary underline outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Eye aria-hidden="true" className="size-[18px]" />
          Ver perfil público
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <AccountSectionNav className="lg:sticky lg:top-24" />
        <div className="flex min-w-0 flex-col gap-6">
          <DeveloperProfileForm
            profile={profile}
            ratingSlot={<RatingSummary summary={summary} developerId={actorId} />}
          />
          <PayoutsLinkCard />
        </div>
      </div>
    </main>
  );
}
