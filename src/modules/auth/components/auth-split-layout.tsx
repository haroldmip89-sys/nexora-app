import type { ReactNode } from "react";

import { ImageCarousel } from "@/components/shared/image-carousel";
import { authSlides } from "@/modules/auth/content/auth-slides";

// The global header is sticky and in normal flow (~3.8rem), so the split block
// takes the remaining viewport height on desktop and nothing hides under it.
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 md:grid md:min-h-[calc(100dvh-4rem)] md:grid-cols-2">
      <div className="relative hidden min-h-[32rem] bg-brand-deep md:block">
        <ImageCarousel
          slides={authSlides}
          sizes="(min-width: 768px) 50vw, 0px"
          className="absolute inset-0"
        />
      </div>
      <div className="flex items-center justify-center bg-background px-4 py-10">{children}</div>
    </main>
  );
}
