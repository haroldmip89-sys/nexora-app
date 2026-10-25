import { Suspense } from "react";
import { getHomeCta } from "@/modules/auth/services/home-cta";
import { resolveNavViewer } from "@/modules/auth/services/nav-viewer.service";
import { LandingBenefits } from "@/modules/landing/components/landing-benefits";
import { LandingDevelopers } from "@/modules/landing/components/landing-developers";
import { LandingFaq } from "@/modules/landing/components/landing-faq";
import { LandingFinalCta } from "@/modules/landing/components/landing-final-cta";
import { LandingHero } from "@/modules/landing/components/landing-hero";
import { LandingHowItWorks } from "@/modules/landing/components/landing-how-it-works";
import { LandingProjects } from "@/modules/landing/components/landing-projects";
import { PublicCatalogSkeleton } from "@/modules/projects/components/public-catalog-skeleton";

export default async function Home() {
  const viewer = await resolveNavViewer();
  const cta = getHomeCta(viewer);

  return (
    <main className="flex-1">
      <LandingHero cta={cta} />
      <Suspense
        fallback={
          <div className="mx-auto max-w-page px-6 py-[72px]">
            <PublicCatalogSkeleton />
          </div>
        }
      >
        <LandingProjects viewer={viewer} />
      </Suspense>
      <LandingHowItWorks />
      <LandingBenefits cta={cta} />
      <LandingDevelopers cta={cta} />
      <LandingFaq />
      <LandingFinalCta cta={cta} />
    </main>
  );
}
