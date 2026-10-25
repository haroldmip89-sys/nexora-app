import { isActivePath } from "@/lib/is-active-path";

/** Sign-in and sign-up screens (split layout): they show a bare header and no footer. */
export function isAuthPath(pathname: string): boolean {
  return isActivePath(pathname, "/sign-in") || isActivePath(pathname, "/sign-up");
}
