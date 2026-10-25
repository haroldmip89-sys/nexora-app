import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HOW_IT_WORKS } from "@/modules/landing/content/landing-content";

export function LandingHowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-title" className="border-b border-border bg-background">
      <Tabs defaultValue={HOW_IT_WORKS.tracks[0].value} className="mx-auto max-w-page gap-8 px-6 py-[72px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex max-w-[620px] flex-col gap-2">
            <p className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">{HOW_IT_WORKS.eyebrow}</p>
            <h2 id="como-title" className="text-3xl leading-[1.15] font-extrabold tracking-[-0.02em] sm:text-4xl">
              {HOW_IT_WORKS.title}
            </h2>
          </div>
          <TabsList aria-label={HOW_IT_WORKS.tabsLabel} className="h-auto gap-1 rounded-xl border border-border bg-card p-1">
            {HOW_IT_WORKS.tracks.map((track) => (
              <TabsTrigger
                key={track.value}
                value={track.value}
                className="min-h-11 rounded-[9px] px-4 text-sm font-bold text-muted-foreground data-active:bg-primary data-active:text-primary-foreground"
              >
                {track.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {HOW_IT_WORKS.tracks.map((track) => (
          <TabsContent key={track.value} value={track.value} className="text-base">
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
              {track.steps.map((step) => (
                <li key={step.n} className="surface flex flex-col gap-3.5 p-6">
                  <span aria-hidden="true" className="flex items-center justify-between">
                    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={step.icon} />
                      </svg>
                    </span>
                    <span className="text-3xl font-extrabold text-input">{step.n}</span>
                  </span>
                  <h3 className="text-[17px] font-extrabold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-text-body">{step.text}</p>
                </li>
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
