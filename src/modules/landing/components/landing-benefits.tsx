import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeCta } from "@/modules/auth/services/home-cta";
import { BENEFITS, resolveAccountCta } from "@/modules/landing/content/landing-content";

export function LandingBenefits({ cta }: { cta: HomeCta }) {
  const account = resolveAccountCta(cta, BENEFITS.cta);

  return (
    <section aria-labelledby="por-que-title" className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-page flex-wrap items-start gap-12 px-6 py-[72px]">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{BENEFITS.eyebrow}</p>
          <h2 id="por-que-title" className="text-3xl leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-4xl">
            {BENEFITS.title}
          </h2>
          <p className="leading-relaxed text-text-body">{BENEFITS.text}</p>
          {account && (
            <Link
              href={account.href}
              className={cn(buttonVariants({ size: "touch" }), "h-12 self-start rounded-xl px-5 text-[15px] font-bold")}
            >
              {account.label}
            </Link>
          )}
        </div>
        <ul className="grid min-w-0 flex-[2_1_560px] grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
          {BENEFITS.items.map((item) => (
            <li key={item.title} className="flex flex-col gap-2.5 rounded-2xl border border-divider bg-surface-subtle p-[22px]">
              <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
              </span>
              <h3 className="text-base font-extrabold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-text-body">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
