// The register's GOV.UK page, via the GOV.UK Content API (JSON). The CSV link changes with every
// update, so we read the page's attachments each time rather than hard-coding the file URL.
export const REGISTER_PAGE_API =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

const USER_AGENT = "visasponsorjobsuk-register-sync";
const ALLOWED_HOST = "assets.publishing.service.gov.uk";

type Attachment = { url?: string; content_type?: string };
type ContentPage = { details?: { attachments?: Attachment[] } };

export function pickCsvUrl(page: ContentPage): string {
  const csvs = (page.details?.attachments ?? []).filter((a) => a.content_type === "text/csv" && a.url);
  if (csvs.length !== 1) {
    throw new Error(`Expected exactly one CSV on the register page, found ${csvs.length}`);
  }
  const url = csvs[0].url!;
  if (new URL(url).host !== ALLOWED_HOST) throw new Error(`Register CSV is not a GOV.UK file: ${url}`);
  return url;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res;
}

// Downloads today's register. Returns the file's URL (recorded in the run log) and its text.
export async function downloadRegister(): Promise<{ url: string; text: string }> {
  const page = (await (await get(REGISTER_PAGE_API)).json()) as ContentPage;
  const url = pickCsvUrl(page);
  const text = await (await get(url)).text();
  return { url, text };
}
