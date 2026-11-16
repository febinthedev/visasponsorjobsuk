import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole, type Role } from "./profile";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: Role | null;
  // From the Google account, for display only (user-editable metadata; never use for access checks).
  name: string | null;
  avatarUrl: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

// The signed-in user, verified from the session token (getClaims checks the signature), plus
// their role from the database; or null when signed out.
// 'use cache: private': the session check compares the token's expiry with the current time and
// the database driver uses random values, which Next.js (Cache Components + Partial Prefetching)
// only allows inside a cache scope. "private" keeps the result in the user's browser only; it is
// never cached on the server.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  "use cache: private";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const meta = claims.user_metadata ?? {};
  return {
    id: claims.sub,
    email: str(claims.email),
    role: await getRole(claims.sub),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
  };
}

// Sends signed-out visitors to /auth/login, then back to `next` afterwards.
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  return user;
}

// Admin-only pages: anyone else gets a plain 404, so admin pages aren't advertised.
export async function requireAdmin(next: string): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (user.role !== "admin") notFound();
  return user;
}
