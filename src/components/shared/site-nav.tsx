"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { buttonVariants } from "@/components/ui/button";
import { getActiveHref, isActivePath } from "@/lib/is-active-path";
import { cn } from "@/lib/utils";
import type { NavLinkItem } from "@/modules/auth/services/dashboard-link";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const NAV_LINK = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm";
const LIST_ID = "site-nav-list";

type SiteNavProps = {
  /** Navigation links already resolved on the server (Projects, plus role dashboard). */
  links: NavLinkItem[];
  /** true: shows the Clerk user button; false: sign-in / sign-up actions. */
  signedIn: boolean;
};

const subscribeNoop = () => () => {};

export function SiteNav({ links, signedIn }: SiteNavProps) {
  const pathname = usePathname();
  // Clerk's UserButton renders nothing on the server but can render at once on a client that already
  // has Clerk loaded, which breaks hydration. Mount it only after hydration, behind a same-size placeholder.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  // Remember the path where the menu was opened: it closes itself on route change without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const items = signedIn ? links : [...links, { href: "/sign-in", label: "Iniciar sesión" }];
  const activeHref = getActiveHref(pathname, items.map((item) => item.href));
  const close = () => setOpenedAt(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      close();
      buttonRef.current?.focus();
    }
  }

  return (
    <header className="relative border-b border-border bg-card" onKeyDown={handleKeyDown}>
      <div className="mx-auto flex w-full max-w-page items-center gap-1 px-3 py-2 sm:gap-2 sm:px-6">
        <Link
          href="/"
          aria-current={isActivePath(pathname, "/") ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-foreground sm:gap-2",
            FOCUS,
          )}
        >
          <Image src="/logo.png" alt="" width={30} height={30} className="size-[30px] shrink-0" />
          <span className="text-xl font-extrabold tracking-[-0.03em] lowercase max-[359px]:sr-only sm:text-[22px]">Nexora</span>
        </Link>

        <nav
          aria-label="Principal"
          className={cn(
            "absolute inset-x-0 top-full z-10 bg-card px-4 md:static md:flex-1 md:border-0 md:bg-transparent md:px-0",
            open && "border-b border-border",
          )}
        >
          <ul
            id={LIST_ID}
            className={cn("flex-col gap-1 py-2 md:flex md:flex-row md:items-center md:py-0", open ? "flex" : "hidden")}
          >
            {items.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                    className={cn(
                      NAV_LINK,
                      FOCUS,
                      active ? "bg-secondary font-bold text-primary" : "font-semibold text-muted-foreground hover:text-primary",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-warning-border bg-warning-bg px-2 py-1 text-[11px] font-bold text-warning-fg sm:px-2.5 sm:text-xs">
            Modo de prueba
          </span>
          {signedIn ? (
            hydrated ? (
              <UserButton appearance={{ elements: { userButtonTrigger: "min-h-11 min-w-11 justify-center" } }} />
            ) : (
              <span aria-hidden="true" className="inline-block size-11" />
            )
          ) : (
            <Link
              href="/sign-up"
              aria-current={isActivePath(pathname, "/sign-up") ? "page" : undefined}
              className={cn(
                buttonVariants({ size: "touch" }),
                "px-3 sm:px-4",
                FOCUS,
              )}
            >
              Registrarse
            </Link>
          )}

          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={LIST_ID}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpenedAt(open ? null : pathname)}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-primary md:hidden",
              FOCUS,
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
