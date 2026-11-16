// Where to send someone after sign-in. Only same-site paths are allowed, so a crafted
// link can't bounce users to another website ("//evil.com", "/\evil.com", "https://...").
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
