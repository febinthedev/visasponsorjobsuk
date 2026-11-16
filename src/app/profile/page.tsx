import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <ProfileDetails />
      </Suspense>
    </main>
  );
}

async function ProfileDetails() {
  const user = await requireUser("/profile");

  return (
    <div className="flex flex-col gap-4">
      <p>
        Signed in as <strong>{user.email}</strong>
        {user.role === "admin" && " (admin)"}
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
