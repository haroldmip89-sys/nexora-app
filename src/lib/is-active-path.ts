/** True when `pathname` is `href` or lives under it (segment boundary); `/` only matches itself. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Among `hrefs`, the active one with the longest match per isActivePath; null if none. */
export function getActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isActivePath(pathname, href) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
