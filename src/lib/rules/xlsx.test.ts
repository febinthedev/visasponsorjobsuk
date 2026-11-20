import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readSheet } from "./xlsx";

// A minimal .xlsx with two sheets, built the way Excel stores them.
function workbook(): Uint8Array {
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        `<sheet name="INFO" sheetId="1" r:id="rId1"/><sheet name="SOC2020 coding index" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(`<sst><si><t>SOC2020</t></si><si><t>Title</t></si><si><r><t>Software </t></r><r><t>engineer</t></r></si><si><t>R&amp;D manager</t></si></sst>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData></worksheet>`),
    "xl/worksheets/sheet2.xml": strToU8(
      `<worksheet><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2"><v>2136</v></c><c r="C2" t="s"><v>2</v></c></row>` +
        `<row r="3"><c r="A3" t="inlineStr"><is><t>1121</t></is></c><c r="C3" t="s"><v>3</v></c></row>` +
        `</sheetData></worksheet>`,
    ),
  });
}

describe("readSheet", () => {
  it("reads a sheet by name into rows of text, keeping each cell in its column", () => {
    expect(readSheet(workbook(), "SOC2020 coding index")).toEqual([
      ["SOC2020", "", "Title"],
      ["2136", "", "Software engineer"],
      ["1121", "", "R&D manager"],
    ]);
  });

  it("fails clearly when the sheet isn't there", () => {
    expect(() => readSheet(workbook(), "Nope")).toThrow(/sheet "Nope" not found/);
  });
});
