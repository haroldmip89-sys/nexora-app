import Link from "next/link";
import { SiteNav } from "@/components/shared/site-nav";
import { getAccountLink, getDashboardLink } from "@/modules/auth/services/dashboard-link";
import type { NavLinkItem } from "@/modules/auth/services/dashboard-link";
import { resolveNavViewer } from "@/modules/auth/services/nav-viewer.service";

/** Resolves the viewer on the server and hands serializable props to the client nav. */
export async function SiteHeader() {
  const viewer = await resolveNavViewer();
  const dashboard = getDashboardLink(viewer);
  const links: NavLinkItem[] = [{ href: "/projects", label: "Proyectos" }];
  if (dashboard) links.push(dashboard);
  const account = getAccountLink(viewer);
  if (account) links.push(account);

  return <SiteNav links={links} signedIn={viewer.kind !== "visitor"} />;
}

/** Static placeholder (logo only, same height) shown while the header streams in. */
export function SiteHeaderFallback() {
  return (
    <header className="border-b border-[#E3E8E3] bg-[#F5F6F2]">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg px-1 text-lg font-semibold tracking-tight text-[#183D30] outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
        >
          Nexora
        </Link>
      </div>
    </header>
  );
}
