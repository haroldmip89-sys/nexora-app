import { FAQ } from "@/modules/landing/content/landing-content";

export function LandingFaq() {
  return (
    <section id="preguntas" aria-labelledby="faq-title" className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-[860px] flex-col gap-6 px-6 py-[72px]">
        <div className="flex flex-col gap-2 text-center">
          <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{FAQ.eyebrow}</p>
          <h2 id="faq-title" className="text-3xl leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-4xl">
            {FAQ.title}
          </h2>
        </div>
        <div className="flex flex-col gap-2.5">
          {FAQ.items.map((item) => (
            <details key={item.q} className="group rounded-[14px] border border-border bg-card px-5">
              <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-base font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {item.q}
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-primary transition-transform group-open:rotate-180">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-5 text-[15px] leading-relaxed text-text-body">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
