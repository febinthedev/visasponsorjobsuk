import { decodeHTML } from "entities";

// "&lt;p&gt;&pound;45k&lt;/p&gt;" → "<p>£45k</p>" (all named and numeric HTML entities).
export function decodeEntities(text: string): string {
  return decodeHTML(text);
}

// The page's <title>, decoded and trimmed; null if missing or empty.
export function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
  return title || null;
}

// Plain text of a job description, for reading the ad with rules and keywords.
// Paragraphs and headings become blank-line breaks, list items "- " lines, <br> and </div> line
// breaks; every other tag is dropped. Not for display: the site shows the original HTML.
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/?(p|h[1-6]|ul|ol|table|section|article|header|footer|blockquote)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
