/** True when `pathname` is `href` or lives under it (segment boundary); `/` only matches itself. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
