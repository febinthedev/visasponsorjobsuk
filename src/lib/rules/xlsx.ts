// Reads one sheet of an .xlsx file into rows of text. Just enough of the format for the ONS coding
// index (an .xlsx is a zip of XML files): shared strings, inline strings and plain values.
import { decodeXML } from "entities";
import { strFromU8, unzipSync } from "fflate";

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
// All <t> text inside an element, joined (rich text is split into several runs).
const text = (xml: string) => decodeXML([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));

// "C12" → 2 (zero-based column index).
function column(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readSheet(file: Uint8Array, sheetName: string): string[][] {
  const files = unzipSync(file, { filter: (f) => f.name.startsWith("xl/") && f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  const sheetTag = [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => decodeXML(attr(t, "name") ?? "") === sheetName);
  if (!sheetTag) throw new Error(`sheet "${sheetName}" not found`);
  const relId = attr(sheetTag, "r:id");
  const relTag = [...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, "Id") === relId);
  const target = attr(relTag ?? "", "Target") ?? "";
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;

  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text(m[1]));

  const rows: string[][] = [];
  for (const [, rowXml] of read(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const [, open, body = ""] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = attr(open, "t");
      const value = body.match(/<v>([^<]*)<\/v>/)?.[1];
      const cell = type === "s" ? (shared[Number(value)] ?? "") : type === "inlineStr" ? text(body) : decodeXML(value ?? "");
      const col = column(attr(open, "r") ?? "");
      while (row.length < col) row.push("");
      row[col] = cell;
    }
    rows.push(row);
  }
  return rows;
}
