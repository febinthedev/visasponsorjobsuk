// Avatar fallback: first + last initial of the name, else the email's first letter, else "?".
export function initials(name: string | null, email: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

// Sign-in link that brings the user back to the page they were on.
export function signInHref(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/auth/")) return "/auth/login";
  return `/auth/login?next=${encodeURIComponent(pathname)}`;
}
