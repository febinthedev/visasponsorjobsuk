import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, pageTitle } from "./html";

describe("pageTitle", () => {
  it("returns the decoded, trimmed <title>", () => {
    expect(pageTitle("<html><head><title>\n  Smith &amp; Co Jobs </title></head></html>")).toBe("Smith & Co Jobs");
  });

  it("returns null when there is no title", () => {
    expect(pageTitle("<html><head></head></html>")).toBeNull();
    expect(pageTitle("<title>  </title>")).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("turns escaped HTML (as Greenhouse sends it) back into HTML", () => {
    expect(decodeEntities("&lt;p&gt;Salary &pound;45,000 &ndash; it&rsquo;s &amp; more&lt;/p&gt;")).toBe(
      "<p>Salary £45,000 – it’s & more</p>",
    );
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, headings and list items on separate lines", () => {
    expect(htmlToText("<h3>About</h3><p>We build.</p><ul><li>Python</li><li>SQL</li></ul><p>Apply<br>now</p>")).toBe(
      "About\n\nWe build.\n\n- Python\n- SQL\n\nApply\nnow",
    );
  });

  it("decodes entities and collapses stray whitespace", () => {
    expect(htmlToText("<p>  £45,000&nbsp;&ndash;   £55,000 </p>")).toBe("£45,000 – £55,000");
  });

  it("drops scripts and styles entirely", () => {
    expect(htmlToText("<style>.x{}</style><p>Hi</p><script>alert(1)</script>")).toBe("Hi");
  });

  it("doesn't glue words together across tags", () => {
    expect(htmlToText("<div>Visa</div><div>sponsorship</div>")).toBe("Visa\nsponsorship");
    expect(htmlToText("<span>Visa</span> <span>sponsorship</span>")).toBe("Visa sponsorship");
  });

  it("handles an empty description", () => {
    expect(htmlToText("")).toBe("");
  });
});
