"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { signInHref } from "@/lib/auth/display";

// A link styled as a button (Base UI's Button is for actions, not navigation).
export function SignInButton() {
  const pathname = usePathname();
  if (pathname.startsWith("/auth/")) return null; // already on the sign-in pages

  return (
    <Link href={signInHref(pathname)} className={buttonVariants()}>
      Sign in
    </Link>
  );
}
