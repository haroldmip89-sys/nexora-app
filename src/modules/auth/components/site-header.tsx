import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "@/components/shared/site-nav";
import { getAccountLink, getDashboardLink } from "@/modules/auth/services/dashboard-link";
import type { NavLinkItem } from "@/modules/auth/services/dashboard-link";
import { resolveNavViewer } from "@/modules/auth/services/nav-viewer.service";

/** Resolves the viewer on the server and hands serializable props to the client nav. */
export async function SiteHeader() {
  const viewer = await resolveNavViewer();
  const dashboard = getDashboardLink(viewer);
  const links: NavLinkItem[] = [];
  if (dashboard) links.push(dashboard);
  links.push({ href: "/projects", label: "Proyectos" });
  const account = getAccountLink(viewer);
  if (account) links.push(account);

  return <SiteNav links={links} signedIn={viewer.kind !== "visitor"} />;
}

/** Static placeholder (logo only, same height) shown while the header streams in. */
export function SiteHeaderFallback() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-page items-center gap-1 px-3 py-2 sm:gap-2 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:gap-2"
        >
          <Image src="/logo.png" alt="" width={30} height={30} className="size-[30px] shrink-0" />
          <span className="text-xl font-extrabold tracking-[-0.03em] lowercase max-[359px]:sr-only sm:text-[22px]">Nexora</span>
        </Link>
      </div>
    </header>
  );
}
