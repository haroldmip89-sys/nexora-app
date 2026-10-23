import { clerkMiddleware } from "@clerk/nextjs/server";

import { extraCspDirectives } from "@/lib/security-headers";

// Only exposes the Clerk session to `auth()`. Authorization lives in the
// server guards of each page, route handler and server action (spec 004 RF4).
// CSP stays Report-Only (spec 015 D9): moving to enforce is a human decision
// after the manual checklist. Clerk merges `directives` with its defaults.
export default clerkMiddleware({
  contentSecurityPolicy: {
    reportOnly: true,
    directives: extraCspDirectives,
  },
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
