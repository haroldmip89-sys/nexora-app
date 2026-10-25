import type { ClerkAppearanceTheme } from "@clerk/nextjs/types";

const FOCUS_RING = "focus-visible:ring-3 focus-visible:ring-ring/40";

/**
 * Single Clerk appearance for sign-in and sign-up.
 * Clerk does not read Tailwind CSS variables, so the 022a tokens from
 * `src/app/globals.css` are replicated here as literals (keep in sync).
 * `fontFamily` references the next/font variable declared in `src/app/layout.tsx`.
 */
export const clerkAppearance: ClerkAppearanceTheme = {
  variables: {
    colorPrimary: "#183D30",
    colorForeground: "#1F2420",
    colorMutedForeground: "#535E56",
    colorBackground: "#FFFFFF",
    colorInput: "#FFFFFF",
    colorInputForeground: "#1F2420",
    colorDanger: "#B42318",
    fontFamily: "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-md shadow-none",
    card: "shadow-none border-0 bg-transparent p-0",
    formButtonPrimary: `min-h-11 ${FOCUS_RING}`,
    socialButtonsBlockButton: "min-h-11",
    formFieldInput: "min-h-11",
    // "Already have an account? Sign in": keep text and link on ONE line and vertically centered
    // (the 44px link would otherwise stretch the row and leave the text floating above it).
    footerAction: "flex flex-wrap items-center justify-center gap-x-1",
    footerActionText: "m-0",
    footerActionLink: `m-0 inline-flex min-h-11 items-center text-primary ${FOCUS_RING}`,
  },
};
