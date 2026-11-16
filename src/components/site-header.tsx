import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignInButton } from "@/components/sign-in-button";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser } from "@/lib/auth/session";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="rounded-sm text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          VisaSponsorJobsUK
        </Link>

        {/* Reads the session, so it streams in behind Suspense while the rest of the page is static. */}
        <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
          <AccountArea />
        </Suspense>
      </div>
    </header>
  );
}

async function AccountArea() {
  const user = await getCurrentUser();
  if (!user) return <SignInButton />;

  return (
    <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
  );
}
