import { describe, expect, it } from "vitest";
import { pickCsvUrl } from "./source";

const CSV_URL =
  "https://assets.publishing.service.gov.uk/media/6af59528cc0dbfec767a5080/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-12.csv";

// Same shape as https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers
const page = (attachments: object[]) => ({ title: "Register of licensed sponsors: workers", details: { attachments } });

describe("pickCsvUrl", () => {
  it("returns the CSV attachment's link", () => {
    expect(
      pickCsvUrl(
        page([
          { title: "Guidance", url: "https://assets.publishing.service.gov.uk/media/x/guide.pdf", content_type: "application/pdf" },
          { title: "Register of Worker and Temporary Worker licensed sponsors", url: CSV_URL, content_type: "text/csv" },
        ]),
      ),
    ).toBe(CSV_URL);
  });

  it("stops when there is no CSV", () => {
    expect(() => pickCsvUrl(page([]))).toThrow(/expected exactly one CSV/i);
  });

  it("stops when there are several CSVs (can't tell which is the register)", () => {
    expect(() =>
      pickCsvUrl(
        page([
          { url: CSV_URL, content_type: "text/csv" },
          { url: "https://assets.publishing.service.gov.uk/media/y/other.csv", content_type: "text/csv" },
        ]),
      ),
    ).toThrow(/expected exactly one CSV/i);
  });

  it("only accepts files hosted on GOV.UK", () => {
    expect(() => pickCsvUrl(page([{ url: "https://example.com/register.csv", content_type: "text/csv" }]))).toThrow(
      /not a GOV.UK/i,
    );
  });
});
