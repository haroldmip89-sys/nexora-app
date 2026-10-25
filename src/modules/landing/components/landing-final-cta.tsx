import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeCta } from "@/modules/auth/services/home-cta";
import { FINAL_CTA, resolveAccountCta } from "@/modules/landing/content/landing-content";

export function LandingFinalCta({ cta }: { cta: HomeCta }) {
  const account = resolveAccountCta(cta, FINAL_CTA.primaryCta);

  return (
    <section aria-labelledby="cta-title" className="bg-card">
      <div className="mx-auto max-w-page px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-secondary p-8 sm:p-12">
          <div className="flex flex-[1_1_420px] flex-col gap-2.5">
            <h2 id="cta-title" className="text-[34px] leading-[1.15] font-extrabold tracking-[-0.02em] text-secondary-foreground">
              {FINAL_CTA.title}
            </h2>
            <p className="leading-relaxed text-secondary-foreground/85">{FINAL_CTA.text}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {account && (
              <Link href={account.href} className={cn(buttonVariants({ size: "hero" }), "rounded-xl font-bold")}>
                {account.label}
              </Link>
            )}
            <Link
              href="#proyectos"
              className={cn(
                buttonVariants({ variant: "outline", size: "hero" }),
                "rounded-xl border-primary bg-transparent font-bold text-primary hover:bg-card/50",
              )}
            >
              {FINAL_CTA.secondaryCta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
