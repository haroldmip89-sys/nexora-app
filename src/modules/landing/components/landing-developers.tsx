import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeCta } from "@/modules/auth/services/home-cta";
import { DEVELOPERS, resolveAccountCta } from "@/modules/landing/content/landing-content";

export function LandingDevelopers({ cta }: { cta: HomeCta }) {
  const account = resolveAccountCta(cta, DEVELOPERS.primaryCta);

  return (
    <section id="desarrolladores" aria-labelledby="dev-title" className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-12 px-6 py-[72px]">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          <p className="text-[13px] font-bold tracking-[0.08em] text-on-dark uppercase">{DEVELOPERS.eyebrow}</p>
          <h2 id="dev-title" className="text-3xl leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-4xl">
            {DEVELOPERS.title}
          </h2>
          <p className="leading-relaxed text-secondary">{DEVELOPERS.text}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {account && (
              <Link
                href={account.href}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "touch" }),
                  "h-12 rounded-xl bg-card px-5 text-[15px] font-extrabold text-primary hover:bg-secondary",
                )}
              >
                {account.label}
              </Link>
            )}
            <Link
              href="#proyectos"
              className={cn(
                buttonVariants({ variant: "outline", size: "touch" }),
                "h-12 rounded-xl border-on-dark/40 bg-transparent px-5 text-[15px] font-bold text-primary-foreground hover:bg-brand-deep hover:text-primary-foreground",
              )}
            >
              {DEVELOPERS.secondaryCta}
            </Link>
          </div>
        </div>
        <ul className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
          {DEVELOPERS.points.map((point) => (
            <li key={point.title} className="flex items-start gap-3.5 rounded-[14px] border border-brand-deep-border bg-brand-deep px-5 py-[18px]">
              <span aria-hidden="true" className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-[15px] font-extrabold">{point.title}</span>
                <span className="text-sm leading-snug text-on-dark">{point.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
