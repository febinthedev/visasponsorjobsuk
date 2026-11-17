// What every board reader returns, whatever the hiring system.

export type BoardJob = {
  external_id: string; // the job's ID on the hiring system
  title: string;
  description_html: string; // as the employer wrote it (shown on the site, sanitised at render time)
  description_text: string; // plain text, for reading the ad with rules
  apply_url: string; // the job's page on the employer's hiring system
  locations: string[]; // place text exactly as given, one entry per place
  countries: string[]; // country values exactly as given (codes like "GB" or names like "United Kingdom"); [] if none
  remote: boolean | null; // the system's own remote flag; null if it has none
  posted_at: Date | null;
};

export type Board = {
  company_name: string | null; // the name the board shows; null if the system doesn't give one
  jobs: BoardJob[];
};

// summary: only what discovery needs (company name, titles, places). Readers that need extra
// requests for descriptions skip them, so jobs may have an empty description and apply URL.
export type ReadOptions = { summary?: boolean };

// Reads one board. Resolves to null when the board doesn't exist on that system.
export type BoardReader = (boardKey: string, fetchFn?: typeof fetch, opts?: ReadOptions) => Promise<Board | null>;
