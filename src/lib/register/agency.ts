// Words in an employer's name that mark a recruitment/staffing agency. Kept deliberately strict:
// broader words ("agency", "personnel", "employment", "talent", "search") also match genuine
// employers (e.g. "Homes and Communities Agency", a home-care agency), so they're left out.
// Matched as whole words; recruit* and headhunt* also match their longer forms.
const AGENCY_WORD = /\b(recruit\w*|staffing|resourcing|locums?|headhunt\w*)\b/i;

// Why this employer counts as an agency, or null if it doesn't. The reason is stored in
// sponsors.agency_reason so a wrong flag can be traced back to the word that caused it.
export function agencyReason(name: string): string | null {
  const match = name.match(AGENCY_WORD);
  return match ? `name contains "${match[1].toLowerCase()}"` : null;
}
