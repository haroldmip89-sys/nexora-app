import Link from "next/link";
import { ImageCarousel } from "@/components/shared/image-carousel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeCta } from "@/modules/auth/services/home-cta";
import { HERO, HERO_SLIDES, resolveAccountCta } from "@/modules/landing/content/landing-content";

export function LandingHero({ cta }: { cta: HomeCta }) {
  const account = resolveAccountCta(cta, HERO.primaryCta);

  return (
    <section
      id="inicio"
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden border-b border-border bg-background"
    >
      {/* Photos as the section background. The mask keeps the text side almost clear (legibility)
          and reveals the photo toward the right (top-to-bottom on small screens). */}
      <ImageCarousel
        slides={[...HERO_SLIDES]}
        sizes="100vw"
        className="absolute inset-0 -z-10"
        slidesClassName="[mask-image:linear-gradient(to_bottom,rgb(0_0_0/0.22),rgb(0_0_0/0.22))] lg:[mask-image:linear-gradient(to_right,rgb(0_0_0/0.08)_0%,rgb(0_0_0/0.22)_42%,#000_85%)]"
        controlsClassName="left-auto right-4 bottom-4"
      />
      {/* The content layer does not capture clicks except on its own column, so the carousel
          pause button (bottom-right of the section) stays reachable at any width. */}
      <div className="pointer-events-none mx-auto flex min-h-[540px] max-w-page items-center px-6 py-[72px] lg:min-h-[620px]">
        <div className="pointer-events-auto flex min-w-0 max-w-[600px] flex-col gap-6">
          <p className="inline-flex self-start items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[13px] font-bold text-secondary-foreground">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            {HERO.badge}
          </p>
          <h1
            id="hero-title"
            className="text-4xl leading-[1.05] font-extrabold tracking-[-0.035em] text-foreground sm:text-5xl lg:text-[56px]"
          >
            {HERO.title}
          </h1>
          <p className="max-w-[540px] text-lg leading-relaxed text-text-body">{HERO.text}</p>
          <div className="flex flex-wrap gap-3">
            {account && (
              <Link href={account.href} className={cn(buttonVariants({ size: "hero" }), "rounded-xl font-bold")}>
                {account.label}
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
            <Link
              href="#proyectos"
              className={cn(buttonVariants({ variant: "outline", size: "hero" }), "rounded-xl border-input font-bold text-primary")}
            >
              {HERO.secondaryCta}
            </Link>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-7 gap-y-3">
            {HERO.trust.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm font-semibold text-text-body">
                <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-lg border border-border bg-card text-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
