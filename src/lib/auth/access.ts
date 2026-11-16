// Which pages need what. Everything not listed here is public.
// Add new signed-in-only pages (e.g. saved jobs) to USER_PATHS.
const USER_PATHS = ["/profile"];
const ADMIN_PATHS = ["/admin"];

export type Access = "public" | "user" | "admin";
export type Decision = "allow" | "login" | "deny";

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export function accessFor(pathname: string): Access {
  if (matches(pathname, ADMIN_PATHS)) return "admin";
  if (matches(pathname, USER_PATHS)) return "user";
  return "public";
}

export function decide(access: Access, who: { signedIn: boolean; isAdmin: boolean }): Decision {
  if (access === "public") return "allow";
  if (!who.signedIn) return "login";
  if (access === "admin" && !who.isAdmin) return "deny";
  return "allow";
}
