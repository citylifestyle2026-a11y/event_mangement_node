const buildTicketDownloadBodyParams = ({ booking, event, ticket }) => [
  ticket?.attendee?.name || booking?.name,
];

// ================= BUTTON PARAMETER (DYNAMIC URL) =================

const PUBLIC_API_URL = (
  process.env.PUBLIC_API_URL || "https://api.citytoppers.in"
)
  .trim()
  .replace(/\/+$/, "");

const LOCAL_UPLOADS_BASE = `${PUBLIC_API_URL}/uploads/`;

/**
 * Builds the Dynamic URL button suffix.
 *
 * WhatsApp template fixed base URL must be:
 * https://api.citytoppers.in/uploads/
 *
 * Therefore this function must return only:
 * ticket-pdfs/<filename>.pdf
 *
 * It also normalizes already-prefixed paths so
 * `ticket-pdfs/` can never appear twice.
 */
const buildTicketDownloadButtonParam = (ticket) => {
  const rawPdfUrl = String(ticket?.ticketPdfUrl || "").trim();

  if (!rawPdfUrl) {
    return "";
  }

  let pdfPath = rawPdfUrl;

  // Remove the public API/uploads prefix if a full URL was stored.
  if (pdfPath.startsWith(LOCAL_UPLOADS_BASE)) {
    pdfPath = pdfPath.slice(LOCAL_UPLOADS_BASE.length);
  } else {
    // Handle full URL even if it has a slightly different base.
    try {
      const parsedUrl = new URL(pdfPath);

      if (parsedUrl.pathname) {
        pdfPath = parsedUrl.pathname;
      }
    } catch {
      // Keep the original value when it is not a valid absolute URL.
    }

    // Remove leading slash(es).
    pdfPath = pdfPath.replace(/^\/+/, "");

    // Remove /uploads/ if it is still present.
    pdfPath = pdfPath.replace(/^uploads\/+/i, "");
  }

  // Normalize duplicate ticket-pdfs/ prefixes.
  pdfPath = pdfPath.replace(/^(?:ticket-pdfs\/)+/i, "");

  // The WhatsApp template base URL already ends with /uploads/,
  // so only this relative path must be returned.
  return `ticket-pdfs/${pdfPath}`;
};

module.exports = buildTicketDownloadBodyParams;
module.exports.buildTicketDownloadButtonParam =
  buildTicketDownloadButtonParam;