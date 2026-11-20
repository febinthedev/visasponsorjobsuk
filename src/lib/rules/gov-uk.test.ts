import { describe, expect, it } from "vitest";
import { parseOccupations, parseThresholds, readTables } from "./gov-uk";

// Trimmed copies of the real gov.uk markup (Appendix Skilled Occupations / Skilled Worker,
// updated 29 October 2026): <h2> heading, then the table; money cells split by <br>.
const td = (cells: string[]) => `<tr>${cells.map((c) => `\n      <td>${c}</td>`).join("")}\n    </tr>`;
const table = (heading: string, head: string[], rows: string[][]) =>
  `<h2 id="x">${heading}</h2><p>Notes.</p><table>\n  <thead>\n    <tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr>\n  </thead>\n  <tbody>${rows.map(td).join("")}</tbody></table>`;
const T1_HEAD = [
  "SOC 2020 occupation code",
  "Examples of related job titles (non-exclusive)",
  "Going rate (SW – options A and D)",
  "90% of going rate (SW – option B)",
  "80% of going rate (SW – option C)",
  "70% of going rate (SW – option E)",
  "Eligible for PhD points (SW)?",
];
const OCCUPATIONS_PAGE = [
  table("Table 1: Eligible SOC 2020 occupation codes and related going rates based on median ASHE data", T1_HEAD, [
    ["1111 Chief executives and senior officials", "• Chairpersons<br> • Chief executives<br> • Diplomats and foreign office officials ", "£88,100<br>(£45.18 per hour)", "£79,300<br>(£40.67 per hour)", "£70,400<br>(£36.10 per hour)", "£61,600<br>(£31.59 per hour)", "Yes"],
    ["3511 Aircraft pilots and air traffic controllers", "• Airline pilot", "£80,400<br>(£41.23 per hour)", "Not applicable", "Not applicable", "£56,300<br>(£28.87 per hour)", "No"],
  ]),
  table("Table 1a: Additional eligible SOC 2020 occupation codes (only for people sponsored before 22 July 2025)", T1_HEAD, [
    ["1150 Managers and directors in retail and wholesale", "• Shop manager", "£36,400<br>(£18.67 per hour)", "£33,400", "£33,400", "£33,400", "Yes"],
  ]),
  table(
    "Table 3: Eligible health and education SOC 2020 occupation codes where going rates are based on national pay scales",
    ["SOC 2020 occupation code", "Equivalent SOC 2010 occupation code(s)", "Examples of related job titles (non-exclusive)", "Going rate (annual)", "National pay scale source"],
    [
      ["2211 Generalist medical practitioners (England)", "2211", "• Doctor<br>• General practitioner", "Foundation year 1 (F1) and equivalent: £36,616", "<a href=\"x\">Pay and Conditions Circular (M&amp;D) 5/2024 R</a>"],
      ["2211 Generalist medical practitioners (Scotland)", "2211", "• Doctor<br>• Physician", "F1: £38,000", "NHS Circular"],
      ["2231 Nurses", "3211", "• Staff nurse", "See relevant pay band in Table 4", "NHS Agenda for Change"],
    ],
  ),
  table("Table 6: SOC 2020 occupation codes which are not eligible", ["\n<br>SOC 2020 occupation code", "\n<br>Examples of related job titles"], [["\n<br>2463 Clergy", "\n<br>• Vicar"]]),
].join("\n");

const SKILLED_WORKER_PAGE = `<p>SW 4.3. Details.</p>${table("Points for salary", ["Option", "Requirements", "Relevant further rules", "Points"], [
  ["A", "The applicant’s salary equals or exceeds both: <br> • £41,700 per year; and <br> • the going rate for the SOC 2020 occupation code.", "SW 8.1.", "20"],
  ["B", "The applicant has a PhD in a subject relevant to the job and their salary equals or exceeds both: <br> • £37,500 per year; and <br> • 90% of the going rate", "SW 9.1.", "20"],
  ["E", "The applicant is a new entrant at the start of their career and their salary equals or exceeds both: <br> • £33,400 per year and <br> • 70% of the going rate for the SOC 2020 occupation code.", "SW 12.1. to SW 12.3.", "20"],
])}`;

describe("readTables", () => {
  it("reads each table with its heading, header and rows of plain text", () => {
    const [t1] = readTables(OCCUPATIONS_PAGE);
    expect(t1.heading).toMatch(/^Table 1: Eligible/);
    expect(t1.header[2]).toBe("Going rate (SW – options A and D)");
    expect(t1.rows[0][1]).toBe("• Chairpersons\n• Chief executives\n• Diplomats and foreign office officials");
    expect(readTables(OCCUPATIONS_PAGE).map((t) => t.heading.slice(0, 8))).toEqual(["Table 1:", "Table 1a", "Table 3:", "Table 6:"]);
  });
});

describe("parseOccupations", () => {
  it("takes Table 1 occupations with their going rate and 70% (new entrant) rate", () => {
    const occ = parseOccupations(OCCUPATIONS_PAGE);
    expect(occ.find((o) => o.soc_code === "1111")).toEqual({
      soc_code: "1111",
      title: "Chief executives and senior officials",
      going_rate: 88100,
      new_entrant_going_rate: 61600,
    });
    expect(occ.find((o) => o.soc_code === "3511")).toMatchObject({ going_rate: 80400, new_entrant_going_rate: 56300 });
  });

  it("takes Table 3 health and education occupations once each, with no going rate yet (founder decision 2026-11-19)", () => {
    const occ = parseOccupations(OCCUPATIONS_PAGE);
    expect(occ.filter((o) => o.soc_code === "2211")).toEqual([
      { soc_code: "2211", title: "Generalist medical practitioners", going_rate: null, new_entrant_going_rate: null },
    ]);
    expect(occ.find((o) => o.soc_code === "2231")).toMatchObject({ title: "Nurses", going_rate: null });
  });

  it("leaves out Table 1a (only for people already sponsored) and Table 6 (not eligible)", () => {
    const codes = parseOccupations(OCCUPATIONS_PAGE).map((o) => o.soc_code);
    expect(codes).toEqual(["1111", "3511", "2211", "2231"]);
  });

  it("fails loudly if gov.uk changes the table layout, instead of loading wrong figures", () => {
    expect(() => parseOccupations(OCCUPATIONS_PAGE.replace("70% of going rate (SW – option E)", "Something else"))).toThrow(/Table 1/);
    expect(() => parseOccupations("<p>no tables</p>")).toThrow(/Table 1/);
  });
});

describe("parseThresholds", () => {
  it("reads the general (option A) and new-entrant (option E) salary thresholds", () => {
    expect(parseThresholds(SKILLED_WORKER_PAGE)).toEqual({ general: 41700, new_entrant: 33400 });
  });

  it("fails loudly if the options table can't be found", () => {
    expect(() => parseThresholds("<p>nothing</p>")).toThrow(/option A/);
  });
});
