import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { LiveAnnouncer } from "@/components/shared/live-announcer";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader, SiteHeaderFallback } from "@/modules/auth/components/site-header";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexora — Encuentra al desarrollador para tu proyecto",
  description:
    "Publica lo que necesitas construir, recibe propuestas con precio y plazo, compara perfiles y valoraciones, y contrata con un pago a través de Stripe en modo de prueba.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="es"
        className={`${plusJakarta.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col [&>main]:flex-1">
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeader />
          </Suspense>
          {children}
          <SiteFooter />
          <LiveAnnouncer />
        </body>
      </html>
    </ClerkProvider>
  );
}
