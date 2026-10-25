import { CreditCard, Star, User } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Anchor ids shared with the account page and form. */
export const ACCOUNT_ANCHORS = { profile: "perfil", ratings: "valoracion" } as const;

const ITEMS = [
  { label: "Perfil", href: `#${ACCOUNT_ANCHORS.profile}`, Icon: User },
  { label: "Valoraciones", href: `#${ACCOUNT_ANCHORS.ratings}`, Icon: Star },
  { label: "Cobros de prueba", href: "/dashboard/payouts", Icon: CreditCard },
] as const;

const LINK =
  "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium text-foreground outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40";

/** Section navigation for "Mi cuenta". Presentational. */
export function AccountSectionNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Secciones de la cuenta" className={cn("surface p-2", className)}>
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ label, href, Icon }) => (
          <li key={label}>
            <Link href={href} className={LINK}>
              <Icon aria-hidden="true" className="size-[18px] shrink-0 text-primary" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
