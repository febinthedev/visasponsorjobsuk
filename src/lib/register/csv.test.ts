import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits plain rows and columns", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas, escaped quotes and line breaks", () => {
    expect(parseCsv('"Smith, Jones & Co","He said ""hi""","line1\nline2"\n')).toEqual([
      ["Smith, Jones & Co", 'He said "hi"', "line1\nline2"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("Acme,London,,Worker (A rating),Skilled Worker")).toEqual([
      ["Acme", "London", "", "Worker (A rating)", "Skilled Worker"],
    ]);
  });

  it("handles Windows line endings, a byte-order mark and no trailing newline", () => {
    expect(parseCsv("﻿a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});
