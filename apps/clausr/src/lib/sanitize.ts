import DOMPurify from "dompurify";

const purify = typeof window !== "undefined" ? DOMPurify(window) : null;

export function sanitizeHtml(html: string): string {
  if (!purify) return html;
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "span", "div",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tr", "td", "th",
      "a", "img", "code", "pre", "blockquote", "cite",
      "mark", "hr", "sub", "sup",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "id", "style", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
}
