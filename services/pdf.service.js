// services/pdf.service.js
//
// Generates ONE attendee's individual ticket PDF and saves it to local
// disk storage (utils/localUpload.util.js — no second storage system is
// introduced). Used by
// services/ticketDelivery.service.js right after a BookingTicket
// finishes registration (Public or Private) so every registered person
// gets their OWN PDF, containing:
//   - Event Image (event-wise — never one hardcoded banner, always
//     THIS event's own `event.image`)
//   - Event Name
//   - User Photo
//   - User Name
//   - Phone Number
//   - All registration fields actually entered by that person
//     (Name, Phone Number, Email)
//   - Ticket Name
//   - That ticket's OWN existing QR code image (never regenerated)
//   - That ticket's OWN existing ticketNumber / registration number
//     (never regenerated)
//
// NEVER builds a PDF for more than one ticket at a time and NEVER
// reuses a PDF across tickets — every call is scoped to exactly one
// `ticket` document.
//
// ================= VISUAL DESIGN =================
// Single-page, ticket-card layout (custom page size, not A4) modeled on
// the client's own live ticket-view webpage: a full-width event-image
// section at the top — THIS event's own `event.image`, shown whole and
// uncropped at its own aspect ratio (never a small cropped badge, since
// the client bundles their own logo/venue/contact artwork into that one
// picture at event-creation time) — decorative side ribbon borders, a
// bordered "VENUE" box (event-wise — event.venueName/address, only
// shown when the event actually has one; never a hardcoded venue),
// bordered attendee-photo/QR boxes side by side, and a small "Powered
// by City Lifestyle" brand mark bottom-right (the platform's own static
// brand asset — see assets/branding/city-lifestyle-logo.jpg — NOT part
// of any event's own data, so it is identical and correct across every
// event/tenant).
//
// COLORS are sampled directly from the client's own live ticket-view
// webpage (booking.rangesageshubhavsar.com) — maroon header/ribbons/
// borders with a gold ribbon accent and dark-navy text — so the PDF
// matches what attendees already see on the website itself. See the
// BRAND_PRIMARY / BRAND_PRIMARY_DARK / BRAND_ACCENT constants below for
// the exact values and where each is used.

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const uploadImage = require("../utils/localUpload.util");
const deleteImage = require("../utils/deleteLocalFile");
const { UPLOAD_ROOT } = require("../config/uploadPaths");

// ================= STATIC BRAND ASSET (LOADED ONCE) =================
// The platform's own "City Lifestyle" brand mark, bundled with the
// project itself (never fetched over the network, never event/ticket
// data). Read once at module load and cached — a missing file here
// must never break ticket generation, so a failed read just leaves
// brandLogoBuffer null and the watermark section below is skipped.
const BRAND_LOGO_PATH = path.join(
  __dirname,
  "../assets/branding/city-lifestyle-logo.jpg"
);

let brandLogoBuffer = null;
try {
  brandLogoBuffer = fs.readFileSync(BRAND_LOGO_PATH);
} catch (error) {
  console.error("Ticket PDF: failed to load brand logo asset:", error.message);
}

// ================= BRAND COLOR PALETTE (FROM THE LIVE WEBSITE'S OWN TICKET VIEW) =================
// Replaces the earlier "City Lifestyle" navy guess. The user supplied a
// screenshot of their actual production ticket-view page
// (booking.rangesageshubhavsar.com/ticket/view/...) as the real
// reference for "the existing website's visual identity" — colors below
// are sampled directly from that screenshot (maroon header/ribbons/
// borders + gold ribbon accent + dark-navy text), so the generated PDF
// now matches what attendees already see on the website itself, not a
// guessed brand. Layout (scalloped header, circular event badge,
// decorative side ribbons, venue box, photo/QR boxes, footer, brand
// mark) is unchanged — only these constants moved, and because every
// usage below already keys off these named roles (MAROON / MAROON_DARK
// / GOLD / NAVY), no other line in this file needs to change.
const BRAND_PRIMARY = "#7F1229"; // Sampled from the website's header/ribbon/border maroon (~rgb(127,18,41)). Header fill, ribbons, dividers, borders, VENUE pill, footer note.
const BRAND_PRIMARY_DARK = "#5C0D1E"; // Darker shade of the same maroon, for depth. Fallback event badge, ribbon shading.
const BRAND_ACCENT = "#F3B81C"; // Sampled from the website's gold ribbon accent (~rgb(243,184,28)). Ring accents and ribbon shading highlight.
const TEXT_DARK = "#102E52"; // Dark navy sampled from the website's own heading/name text (~rgb(7,20,55)), reused for headings (event title, venue name, attendee name/ticket number).
const GRAY = "#6b7280"; // Neutral secondary text (address, mobile/email/booking lines) — intentionally colorless so it never competes with the brand maroon.
const BORDER_GRAY = "#999999"; // Sampled from the website's own photo/QR box border (~rgb(153,153,153)).

// ================= FETCH REMOTE IMAGE AS BUFFER =================
// Event image / attendee photo / QR image are all already-hosted URLs
// (Cloudinary and/or this server's own local upload storage — see
// event.model.js#image, BookingTicket.attendee's profileImage,
// BookingTicket.qrImage). pdfkit needs raw image bytes to embed them, so
// each is fetched here. Deliberately never throws — a missing/
// unreachable image (e.g. attendee skipped the optional photo upload)
// must never stop the rest of the PDF (or the registration request)
// from completing; that section is simply omitted below. The event
// image is additionally passed through normalizeImageBufferForPdf()
// after this fetch, since it (unlike this function) needs to also
// handle WEBP/other formats pdfkit itself cannot embed — see that
// function's comment.
// ROOT-CAUSE FIX: event image / QR / attendee photo are saved to this
// same server's own local disk by utils/localUpload.util.js, which
// returns a URL of the form `${PUBLIC_BASE_URL}/uploads/<relativePath>`
// (see config/uploadPaths.js). Previously this function always went
// back out over HTTP(S) to fetch that same URL — i.e. the server
// calling itself over the public internet to read a file it had just
// written to its own disk. In production (Plesk) that self-request can
// 404 (reverse-proxy/static-mapping not routing it back to this Node
// process, DNS, outbound firewalling, etc.) even though the file is
// sitting right there on disk, which is exactly the bug being fixed
// here. Any URL that points at this server's own /uploads/ path is now
// read directly from local disk; only a genuinely external URL (e.g. a
// legacy Cloudinary URL from before the migration to local storage)
// still goes through the original HTTP fetch fallback.
const resolveLocalUploadPath = (trimmedUrl) => {
  let pathname;

  try {
    pathname = new URL(trimmedUrl).pathname;
  } catch (error) {
    // Not an absolute URL (e.g. already a bare "/uploads/..." path) —
    // treat the string itself as the pathname.
    pathname = trimmedUrl;
  }

  const marker = "/uploads/";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const relativePath = pathname.slice(markerIndex + marker.length);
  const absolutePath = path.join(UPLOAD_ROOT, relativePath);

  // Refuse to resolve outside UPLOAD_ROOT (defensive, mirrors
  // utils/deleteLocalFile.js's own safety check).
  if (!absolutePath.startsWith(UPLOAD_ROOT)) {
    return null;
  }

  return absolutePath;
};

const fetchImageBuffer = async (url) => {
  const trimmedUrl = url && String(url).trim();

  if (!trimmedUrl) {
    return null;
  }

  // Prefer reading directly from local disk when this URL is this
  // server's own /uploads/ file — no network round-trip, and immune to
  // any reverse-proxy/static-routing issue affecting self-requests.
  const localPath = resolveLocalUploadPath(trimmedUrl);
  if (localPath) {
    try {
      if (fs.existsSync(localPath)) {
        return await fs.promises.readFile(localPath);
      }
      console.error(
        `Ticket PDF: local upload file not found on disk for ${trimmedUrl} (expected at ${localPath})`
      );
      return null;
    } catch (error) {
      console.error(
        `Ticket PDF: local upload read error for ${trimmedUrl}:`,
        error.message
      );
      return null;
    }
  }

  // Fallback: genuinely external URL (e.g. a legacy Cloudinary image
  // saved before the migration to local storage) — fetch over HTTP as
  // before.
  try {
    const response = await fetch(trimmedUrl);

    if (!response.ok) {
      console.error(
        `Ticket PDF: image fetch failed (${response.status}) for ${trimmedUrl}`
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Ticket PDF: image fetch error for ${trimmedUrl}:`, error.message);
    return null;
  }
};

// ================= NORMALIZE EVENT IMAGE FOR PDF EMBEDDING =================
// pdfkit's doc.image()/doc.openImage() can only embed JPEG and PNG
// bytes. Event images, however, are stored (and re-uploaded, whenever
// an admin edits an Event) as WEBP — see utils/localUpload.util.js's
// global "convert every uploaded JPG/PNG/WEBP image to WEBP on save"
// rule — and a Cloudinary-hosted event image can likewise come back as
// WEBP/AVIF/etc. depending on how it was originally uploaded there.
// Without this step, the event-image drawing call below would throw on
// that WEBP buffer; the existing try/catch there would swallow the
// error and silently fall back to the "no image yet" placeholder, so
// the event's own graphic would never actually appear in the PDF.
//
// This re-encodes whatever bytes were fetched (from Cloudinary or any
// other host) into a plain PNG buffer using `sharp` — already an
// existing dependency of this project (see utils/localUpload.util.js) —
// so no new package is introduced. Re-encoding a format pdfkit already
// supports (JPEG/PNG) back to PNG is a safe, lossless-for-embedding
// no-op visually; it only guarantees pdfkit is never handed a format it
// cannot read. Never throws: any failure (corrupt bytes, unsupported
// encoding even for sharp, etc.) resolves to null, so the existing
// "no event image" placeholder path below still applies exactly as
// before — this can only make an event image that used to be dropped
// now show up.
//
// Also returns the image's own natural width/height (read via the same
// sharp call, no extra fetch) — the event-image section below needs
// these to size itself to THIS image's own aspect ratio, so the full,
// uncropped graphic the admin uploaded for this event (which per the
// client may bundle its own logo/venue/contact artwork into one
// picture) is what prints, instead of being cropped into a small
// fixed-size circle.
const normalizeImageBufferForPdf = async (buffer) => {
  if (!buffer) {
    return null;
  }

  try {
    const pngBuffer = await sharp(buffer).png().toBuffer();
    const metadata = await sharp(pngBuffer).metadata();
    return {
      buffer: pngBuffer,
      width: metadata.width || null,
      height: metadata.height || null,
    };
  } catch (error) {
    console.error(
      "Ticket PDF: failed to normalize event image for PDF embedding:",
      error.message
    );
    return null;
  }
};

const safeText = (value, fallback = "-") => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const str = String(value).trim();
  return str ? str : fallback;
};

// Bounds worst-case box height for the (event-wise, variable-length)
// venue address so the fixed-height page layout below can never be
// pushed into overlap/overflow by an unusually long address.
const truncateText = (value, maxLength) => {
  const str = safeText(value, "");
  if (!str || str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 1).trim()}…`;
};

// ================= IMAGE DRAWING HELPERS =================
// Both helpers preserve the source image's own aspect ratio — neither
// ever stretches/distorts an image, satisfying "avoid stretched or
// distorted images" regardless of what shape (square/portrait/
// landscape) the event banner, attendee photo, or QR code happens to
// be.

// "Cover" fit: scales the image up just enough to fill the ENTIRE box,
// then center-crops the overflow. Used for the event badge and the
// attendee photo box, matching the reference design's fully-filled,
// no-letterboxing photo boxes.
const drawCoverImage = (doc, buffer, x, y, w, h) => {
  try {
    const img = doc.openImage(buffer);
    const scale = Math.max(w / img.width, h / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;

    doc.save();
    doc.rect(x, y, w, h).clip();
    doc.image(buffer, drawX, drawY, { width: drawW, height: drawH });
    doc.restore();
  } catch (error) {
    console.error("Ticket PDF: failed to draw cover image:", error.message);
  }
};

const drawCoverImageCircle = (doc, buffer, cx, cy, r) => {
  try {
    const img = doc.openImage(buffer);
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = cx - drawW / 2;
    const drawY = cy - drawH / 2;

    doc.save();
    doc.circle(cx, cy, r).clip();
    doc.image(buffer, drawX, drawY, { width: drawW, height: drawH });
    doc.restore();
  } catch (error) {
    console.error("Ticket PDF: failed to draw circular cover image:", error.message);
  }
};

// "Contain" fit: scales the image DOWN (if needed) to sit fully inside
// the box without any cropping, centered. Used only for the QR code —
// a QR must never be cropped, or it can become unscannable.
const drawContainImage = (doc, buffer, x, y, w, h) => {
  try {
    const img = doc.openImage(buffer);
    const scale = Math.min(w / img.width, h / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;

    doc.image(buffer, drawX, drawY, { width: drawW, height: drawH });
  } catch (error) {
    console.error("Ticket PDF: failed to draw QR image:", error.message);
  }
};

// ================= DECORATIVE SIDE BORDER (BRAND MAROON + GOLD) =================
const drawSideRibbon = (doc, x, ribbonWidth, pageHeight) => {
  const gradient = doc.linearGradient(x, 0, x + ribbonWidth, 0);
  gradient.stop(0, BRAND_PRIMARY_DARK).stop(0.5, BRAND_ACCENT).stop(1, BRAND_PRIMARY_DARK);
  doc.rect(x, 0, ribbonWidth, pageHeight).fill(gradient);

  // White diamonds with a thin maroon outline stay visible against both
  // the dark maroon ends AND the gold middle of the gradient above (a
  // single non-white diamond color couldn't contrast with both).
  const diamondSize = 6;
  for (let dy = 22; dy < pageHeight - 10; dy += 34) {
    doc.save();
    doc.rotate(45, { origin: [x + ribbonWidth / 2, dy] });
    doc
      .rect(x + ribbonWidth / 2 - diamondSize / 2, dy - diamondSize / 2, diamondSize, diamondSize)
      .lineWidth(0.5)
      .fillAndStroke("#ffffff", BRAND_PRIMARY_DARK);
    doc.restore();
  }
};

// ================= BUILD ONE ATTENDEE'S TICKET PDF (BUFFER) =================
// event / ticketType / booking / ticket are the already-fetched mongoose
// (or lean) documents for THIS ticket's registration. Returns a Buffer —
// callers decide what to do with it (upload, save to disk, etc).
const buildTicketPdfBuffer = async ({ event, ticketType, booking, ticket }) => {
  const [eventImageRaw, userPhotoRaw, qrImageBuffer] = await Promise.all([
    fetchImageBuffer(event?.image),
    fetchImageBuffer(ticket?.attendee?.profileImage),
    fetchImageBuffer(ticket?.qrImage),
  ]);

  // Both the event image AND the attendee's own registration photo go
  // through the exact same "convert every uploaded image to WEBP" rule
  // on upload (see utils/localUpload.util.js — routes/bookingTicket.
  // routes.js and routes/publicRegistration.routes.js both save
  // attendee.profileImage through it), so the attendee photo needs the
  // exact same pdfkit-safe re-encode as the event image, for the exact
  // same reason. See normalizeImageBufferForPdf's comment.
  const eventImageBuffer = await normalizeImageBufferForPdf(eventImageRaw);
  const userPhoto = await normalizeImageBufferForPdf(userPhotoRaw);
  const userPhotoBuffer = userPhoto ? userPhoto.buffer : null;

  return new Promise((resolve, reject) => {
    try {
      // Custom ticket-card page size (not A4) so the PDF matches the
      // reference's tall, narrow pass/ticket layout rather than a
      // mostly-empty A4 sheet.
      const PAGE_WIDTH = 420;
      const PAGE_HEIGHT = 900;

      const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const MAROON = BRAND_PRIMARY;
      const MAROON_DARK = BRAND_PRIMARY_DARK;
      const GOLD = BRAND_ACCENT;
      const NAVY = TEXT_DARK;

      const RIBBON_W = 14;
      const CONTENT_PAD = 16;
      const contentLeft = RIBBON_W + CONTENT_PAD;
      const contentRight = PAGE_WIDTH - RIBBON_W - CONTENT_PAD;
      const contentWidth = contentRight - contentLeft;

      // ================= DECORATIVE SIDE BORDERS =================
      drawSideRibbon(doc, 0, RIBBON_W, PAGE_HEIGHT);
      drawSideRibbon(doc, PAGE_WIDTH - RIBBON_W, RIBBON_W, PAGE_HEIGHT);

      // ================= EVENT IMAGE (FULL, UNCROPPED, EVENT-WISE) =================
      // Per the client: the whole graphic — their event's own logo/
      // emblem plus venue callout plus contact links, all pre-designed
      // together into ONE picture — is uploaded as `event.image` at
      // event-creation time, and that exact picture must appear on the
      // ticket, since none of it is a fixed/hardcoded platform asset.
      // A small fixed-size circular crop (the previous approach) would
      // cut away most of that picture, so instead the full image is
      // shown edge-to-edge across the top of the ticket at ITS OWN
      // aspect ratio — the box below is sized FROM the image's real
      // width/height (see normalizeImageBufferForPdf), so "contain"
      // fits it with no cropping and no letterboxing. Clamped between a
      // min/max so an unusually tall or wide upload can never break this
      // fixed-size ticket-card page's layout.
      const EVENT_IMAGE_MIN_HEIGHT = 150;
      const EVENT_IMAGE_MAX_HEIGHT = 340;
      const EVENT_IMAGE_FALLBACK_HEIGHT = 190; // Used only when this event has no image yet.
      const eventImageAreaWidth = PAGE_WIDTH - RIBBON_W * 2;

      let HEADER_HEIGHT = EVENT_IMAGE_FALLBACK_HEIGHT;
      if (eventImageBuffer && eventImageBuffer.width && eventImageBuffer.height) {
        const naturalHeight =
          eventImageAreaWidth * (eventImageBuffer.height / eventImageBuffer.width);
        HEADER_HEIGHT = Math.min(
          EVENT_IMAGE_MAX_HEIGHT,
          Math.max(EVENT_IMAGE_MIN_HEIGHT, naturalHeight)
        );
      }

      // Brand-color backdrop: fully covered by the image above when one
      // exists (box aspect ratio matches the image's own, so there's no
      // gap to show through); doubles as the "no image yet" placeholder
      // background otherwise.
      doc.rect(RIBBON_W, 0, eventImageAreaWidth, HEADER_HEIGHT).fill(MAROON);

      if (eventImageBuffer) {
        drawContainImage(
          doc,
          eventImageBuffer.buffer,
          RIBBON_W,
          0,
          eventImageAreaWidth,
          HEADER_HEIGHT
        );
      } else {
        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(16)
          .text(safeText(event?.title, "Event"), RIBBON_W + 20, HEADER_HEIGHT / 2 - 10, {
            width: eventImageAreaWidth - 40,
            align: "center",
          });
      }

      // Thin gold accent line closing off the event-image section,
      // echoing the ribbon's gold accent instead of the old scalloped
      // cutout (which was designed around the small circular badge this
      // section replaces).
      doc.rect(RIBBON_W, HEADER_HEIGHT - 3, eventImageAreaWidth, 3).fill(GOLD);

      let cursorY = HEADER_HEIGHT + 18;

      // ================= VENUE BOX (EVENT-WISE, OPTIONAL) =================
      // Only rendered when THIS event actually has a venue name set
      // (event.venueName) — never a hardcoded venue/logo for every
      // event.
      const venueName = safeText(event?.venueName, "");
      if (venueName) {
        const boxX = contentLeft;
        const boxW = contentWidth;
        const innerPadTop = 22;
        const addressText = truncateText(event?.address, 90);

        doc.font("Helvetica-Bold").fontSize(11);
        const venueNameHeight = doc.heightOfString(venueName, {
          width: boxW - 24,
          align: "center",
        });

        let addressHeight = 0;
        if (addressText) {
          doc.font("Helvetica").fontSize(8.5);
          addressHeight = doc.heightOfString(addressText, {
            width: boxW - 24,
            align: "center",
          });
        }

        const boxHeight =
          innerPadTop + venueNameHeight + (addressText ? addressHeight + 4 : 0) + 14;
        const boxY = cursorY;

        doc.roundedRect(boxX, boxY, boxW, boxHeight, 6).lineWidth(1).stroke(MAROON);

        const pillW = 72;
        const pillH = 18;
        const pillX = boxX + (boxW - pillW) / 2;
        const pillY = boxY - pillH / 2;
        doc.roundedRect(pillX, pillY, pillW, pillH, 9).fill(MAROON);
        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(9)
          .text("VENUE", pillX, pillY + 4.5, { width: pillW, align: "center" });

        doc
          .fillColor(NAVY)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(venueName, boxX + 12, boxY + innerPadTop, {
            width: boxW - 24,
            align: "center",
          });

        if (addressText) {
          doc
            .fillColor(GRAY)
            .font("Helvetica")
            .fontSize(8.5)
            .text(addressText, boxX + 12, doc.y + 3, {
              width: boxW - 24,
              align: "center",
            });
        }

        cursorY = boxY + boxHeight + 18;
      }

      // ================= DIVIDER =================
      doc
        .moveTo(contentLeft, cursorY)
        .lineTo(contentRight, cursorY)
        .lineWidth(1)
        .strokeColor(MAROON)
        .stroke();
      cursorY += 14;

      // ================= EVENT TITLE + TICKET TYPE =================
      const titleText = safeText(event?.title, "Event").toUpperCase();
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(14);
      const titleHeight = doc.heightOfString(titleText, {
        width: contentWidth,
        align: "center",
      });
      doc.text(titleText, contentLeft, cursorY, { width: contentWidth, align: "center" });
      cursorY += titleHeight + 4;

      const ticketTypeName = safeText(ticketType?.ticketName, "");
      if (ticketTypeName) {
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10.5);
        const subtitleHeight = doc.heightOfString(ticketTypeName, {
          width: contentWidth,
          align: "center",
        });
        doc.text(ticketTypeName, contentLeft, cursorY, {
          width: contentWidth,
          align: "center",
        });
        cursorY += subtitleHeight;
      }
      cursorY += 14;

      // ================= DIVIDER =================
      doc
        .moveTo(contentLeft, cursorY)
        .lineTo(contentRight, cursorY)
        .lineWidth(1)
        .strokeColor(MAROON)
        .stroke();
      cursorY += 18;

      // ================= ATTENDEE PHOTO + QR CODE (SIDE BY SIDE) =================
      const boxGap = 16;
      const boxSize = (contentWidth - boxGap) / 2;
      const photoBoxX = contentLeft;
      const qrBoxX = contentLeft + boxSize + boxGap;
      const rowY = cursorY;

      doc.rect(photoBoxX, rowY, boxSize, boxSize).lineWidth(1).stroke(BORDER_GRAY);
      if (userPhotoBuffer) {
        drawCoverImage(doc, userPhotoBuffer, photoBoxX + 1.5, rowY + 1.5, boxSize - 3, boxSize - 3);
      } else {
        doc
          .fillColor(GRAY)
          .font("Helvetica")
          .fontSize(9)
          .text("No Photo", photoBoxX, rowY + boxSize / 2 - 5, {
            width: boxSize,
            align: "center",
          });
      }

      doc.rect(qrBoxX, rowY, boxSize, boxSize).lineWidth(1).stroke(BORDER_GRAY);
      if (qrImageBuffer) {
        const qrPad = 10;
        drawContainImage(
          doc,
          qrImageBuffer,
          qrBoxX + qrPad,
          rowY + qrPad,
          boxSize - qrPad * 2,
          boxSize - qrPad * 2
        );
      } else {
        doc
          .fillColor(GRAY)
          .font("Helvetica")
          .fontSize(9)
          .text("No QR", qrBoxX, rowY + boxSize / 2 - 5, { width: boxSize, align: "center" });
      }

      cursorY = rowY + boxSize + 10;

      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10.5);
      doc.text(safeText(ticket?.attendee?.name), photoBoxX, cursorY, {
        width: boxSize,
        align: "center",
      });
      doc.text(safeText(ticket?.ticketNumber), qrBoxX, cursorY, {
        width: boxSize,
        align: "center",
      });
      cursorY += 22;

      // ================= REGISTRATION DETAILS =================
      // "All registration fields actually entered by that person" —
      // this project's registration form (bookingTicket.service.js /
      // publicRegistration.service.js) only ever collects Name, Mobile
      // Number and Email, so those (plus the booking number) are what's
      // printed here. Name is already shown as the photo caption above,
      // so it isn't repeated.
      doc
        .moveTo(contentLeft, cursorY)
        .lineTo(contentRight, cursorY)
        .lineWidth(0.75)
        .strokeColor("#e3c6cc")
        .stroke();
      cursorY += 10;

      const detailLine = (text) => {
        doc.font("Helvetica").fontSize(8.5).fillColor(GRAY);
        doc.text(text, contentLeft, cursorY, { width: contentWidth });
        cursorY = doc.y + 3;
      };

      detailLine(`Mobile: ${safeText(ticket?.attendee?.mobileNumber)}`);
      detailLine(`Email: ${safeText(ticket?.attendee?.email)}`);
      detailLine(`Booking No.: ${safeText(ticket?.bookingNumber || booking?.bookingNumber)}`);
      cursorY += 10;

      // ================= FOOTER INSTRUCTION =================
      doc.font("Helvetica-Bold").fontSize(9).fillColor(MAROON);
      const footerText =
        "Please bring a printout of this ticket or keep a soft copy with you at the event entry.";
      const footerHeight = doc.heightOfString(footerText, {
        width: contentWidth,
        align: "center",
      });
      doc.text(footerText, contentLeft, cursorY, { width: contentWidth, align: "center" });
      cursorY += footerHeight + 16;

      // ================= "POWERED BY" BRAND MARK (BOTTOM-RIGHT) =================
      // The platform's own static brand asset — identical and correct
      // on every event/tenant's ticket, unlike the event-wise badge
      // above. Anchored near the bottom of the card, but never above
      // where the dynamic content actually ended, so a long venue
      // address can never push it into overlapping anything.
      if (brandLogoBuffer) {
        const brandR = 16;
        const brandCy = Math.max(cursorY + brandR, PAGE_HEIGHT - 40);
        const brandCx = contentRight - brandR;

        drawCoverImageCircle(doc, brandLogoBuffer, brandCx, brandCy, brandR);
        doc.circle(brandCx, brandCy, brandR).lineWidth(1).stroke(GOLD);

        const brandTextWidth = brandCx - brandR - 6 - contentLeft;
        if (brandTextWidth > 40) {
          doc
            .font("Helvetica")
            .fontSize(6.5)
            .fillColor(GRAY)
            .text("Powered by", contentLeft, brandCy - 9, {
              width: brandTextWidth,
              align: "right",
            });
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor(MAROON)
            .text("City Lifestyle", contentLeft, brandCy - 1, {
              width: brandTextWidth,
              align: "right",
            });
        }
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// ================= GENERATE + UPLOAD ONE TICKET'S PDF =================
// Builds THIS ticket's PDF, saves it to local disk storage, and removes
// the previous PDF file for this exact ticket (if any) so
// re-registrations never leave orphaned files behind. Does not mutate/save
// the `ticket` document — callers (services/ticketDelivery.service.js)
// are responsible for persisting the returned url/public_id.
const generateAndUploadTicketPdf = async ({ event, ticketType, booking, ticket }) => {
  const buffer = await buildTicketPdfBuffer({ event, ticketType, booking, ticket });

  // Unique, human-traceable public_id per generation (ticketNumber +
  // timestamp) so a re-registration's new PDF never collides with — or
  // silently overwrites while still referenced by — an in-flight
  // WhatsApp send using the previous URL.
  const safeTicketNumber = String(ticket?.ticketNumber || ticket?._id || "ticket").replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );
  const publicId = `${safeTicketNumber}-${Date.now()}`;

  // Saved to local disk under uploads/ticket-pdfs/<publicId>.pdf and
  // served publicly via express.static (see app.js). `format: "pdf"`
  // is what makes the saved file end in ".pdf".
  //
  // This does NOT change the WhatsApp "Download Ticket" button flow's
  // shape: buildTicketDownloadBodyParams.js still strips a fixed base
  // URL prefix and forwards everything after it — only that prefix now
  // points at this server's own domain (PUBLIC_API_URL) instead of
  // Cloudinary's. See that file's comments for the required WhatsApp
  // template update this implies.
  const upload = await uploadImage(
    buffer,
    "event-management/ticket-pdfs",
    "image",
    {
      public_id: publicId,
      format: "pdf",
    }
  );

  if (ticket?.ticketPdfPublicId) {
    try {
      await deleteImage(ticket.ticketPdfPublicId);
    } catch (error) {
      console.error(
        `Ticket PDF: failed to delete previous PDF (${ticket.ticketPdfPublicId}):`,
        error.message
      );
    }
  }

  return upload;
};

module.exports = {
  buildTicketPdfBuffer,
  generateAndUploadTicketPdf,
};