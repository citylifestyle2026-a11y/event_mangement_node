// utils/sanitizeText.js
//
// Minimal server-side sanitizer for free-text fields that get stored and
// later rendered back out (Event.description / Event.termsConditions).
// The previous audit found these fields were stored completely as-is,
// so a value like `<script>...</script>` or an inline `onerror=` handler
// would be persisted verbatim and could execute wherever the frontend
// renders it.
//
// Approach: strip HTML tags entirely rather than HTML-entity-escaping
// them. No new dependency is added (no sanitize-html / DOMPurify), and
// unlike escaping (`&` -> `&amp;`, `"` -> `&quot;`, ...), stripping tags
// does not change how any legitimate plain-text content (apostrophes,
// ampersands, quotes) looks when the existing frontend renders it as
// plain text — it only removes actual `<...>` markup, which these two
// fields were never intended to contain.
//
// - Any `<script ...>...</script>` block is removed completely (content
//   included), since leaving the inner text behind is never useful and
//   is the main XSS vector.
// - Any other HTML tag (`<img onerror=...>`, `<a href="javascript:...">`,
//   etc.) is stripped, but the human-readable text around/inside it is
//   preserved.
// - `javascript:` URIs left over as plain text (no surrounding tag) are
//   neutralized so they can't be pasted into an href by a downstream
//   consumer that doesn't re-sanitize.
// - Result is trimmed; collapses to an empty string only if the input
//   was itself empty/only markup, which the existing `required` schema
//   validation on both fields already rejects.
const sanitizeText = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "")
    .trim();
};

module.exports = sanitizeText;
