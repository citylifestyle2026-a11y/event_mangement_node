// services/pdf.service.js
//
// Generates ONE attendee's individual ticket PDF and uploads it to the
// project's existing Cloudinary setup (utils/cloudinary.util.js — no
// second storage system is introduced). Used by
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
// Redesigned as a single-page, ticket-card layout (custom page size,
// not A4) modeled on the client's reference ticket: a maroon header
// with a scalloped bottom edge, a circular event-image badge sitting on
// that scalloped boundary, decorative gold side borders, a bordered
// "VENUE" box (event-wise — event.venueName/address, only shown when
// the event actually has one; never a hardcoded venue), bordered
// attendee-photo/QR boxes side by side, and a small "Powered by City
// Lifestyle" brand mark bottom-right (the platform's own static brand
// asset — see assets/branding/city-lifestyle-logo.jpg — NOT part of
// any event's own data, so it is identical and correct across every
// event/tenant).

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");

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

// ================= FETCH REMOTE IMAGE AS BUFFER =================
// Event image / attendee photo / QR image are all already-hosted
// Cloudinary URLs (see event.model.js#image, BookingTicket.attendee's
// profileImage, BookingTicket.qrImage). pdfkit needs raw image bytes to
// embed them, so each is fetched here. Deliberately never throws — a
// missing/unreachable image (e.g. attendee skipped the optional photo
// upload) must never stop the rest of the PDF (or the registration
// request) from completing; that section is simply omitted below.
const fetchImageBuffer = async (url) => {
  const trimmedUrl = url && String(url).trim();

  if (!trimmedUrl) {
    return null;
  }

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

// ================= DECORATIVE GOLD SIDE BORDER =================
const drawSideRibbon = (doc, x, ribbonWidth, pageHeight, maroon) => {
  const gradient = doc.linearGradient(x, 0, x + ribbonWidth, 0);
  gradient.stop(0, "#a9791a").stop(0.5, "#f0d789").stop(1, "#a9791a");
  doc.rect(x, 0, ribbonWidth, pageHeight).fill(gradient);

  const diamondSize = 6;
  for (let dy = 22; dy < pageHeight - 10; dy += 34) {
    doc.save();
    doc.rotate(45, { origin: [x + ribbonWidth / 2, dy] });
    doc
      .rect(x + ribbonWidth / 2 - diamondSize / 2, dy - diamondSize / 2, diamondSize, diamondSize)
      .fill(maroon);
    doc.restore();
  }
};

// ================= BUILD ONE ATTENDEE'S TICKET PDF (BUFFER) =================
// event / ticketType / booking / ticket are the already-fetched mongoose
// (or lean) documents for THIS ticket's registration. Returns a Buffer —
// callers decide what to do with it (upload, save to disk, etc).
const buildTicketPdfBuffer = async ({ event, ticketType, booking, ticket }) => {
  const [eventImageBuffer, userPhotoBuffer, qrImageBuffer] = await Promise.all([
    fetchImageBuffer(event?.image),
    fetchImageBuffer(ticket?.attendee?.profileImage),
    fetchImageBuffer(ticket?.qrImage),
  ]);

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

      const MAROON = "#7a0c24";
      const MAROON_DARK = "#57081a";
      const GOLD = "#c9a227";
      const NAVY = "#16214a";
      const GRAY = "#6b7280";
      const BORDER_GRAY = "#c9c9d1";

      const RIBBON_W = 14;
      const CONTENT_PAD = 16;
      const contentLeft = RIBBON_W + CONTENT_PAD;
      const contentRight = PAGE_WIDTH - RIBBON_W - CONTENT_PAD;
      const contentWidth = contentRight - contentLeft;

      // ================= DECORATIVE SIDE BORDERS =================
      drawSideRibbon(doc, 0, RIBBON_W, PAGE_HEIGHT, MAROON);
      drawSideRibbon(doc, PAGE_WIDTH - RIBBON_W, RIBBON_W, PAGE_HEIGHT, MAROON);

      // ================= MAROON HEADER + SCALLOPED EDGE =================
      const HEADER_HEIGHT = 190;
      doc.rect(RIBBON_W, 0, PAGE_WIDTH - RIBBON_W * 2, HEADER_HEIGHT).fill(MAROON);

      const scallopR = 9;
      for (
        let sx = RIBBON_W + scallopR;
        sx <= PAGE_WIDTH - RIBBON_W - scallopR + 0.01;
        sx += scallopR * 2
      ) {
        doc.circle(sx, HEADER_HEIGHT, scallopR).fill("#ffffff");
      }

      // ================= EVENT-WISE CIRCULAR BADGE =================
      // Always THIS event's own image — never a hardcoded banner, so
      // every event gets its own badge here.
      const badgeCx = PAGE_WIDTH / 2;
      const badgeCy = HEADER_HEIGHT;
      const badgeR = 58;

      if (eventImageBuffer) {
        drawCoverImageCircle(doc, eventImageBuffer, badgeCx, badgeCy, badgeR);
      } else {
        doc.circle(badgeCx, badgeCy, badgeR).fill(MAROON_DARK);
        doc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(truncateText(event?.title, 22), badgeCx - badgeR + 8, badgeCy - 10, {
            width: (badgeR - 8) * 2,
            align: "center",
          });
      }
      doc.circle(badgeCx, badgeCy, badgeR).lineWidth(3).stroke("#ffffff");
      doc.circle(badgeCx, badgeCy, badgeR + 3).lineWidth(2).stroke(GOLD);

      let cursorY = badgeCy + badgeR + 18;

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
// Builds THIS ticket's PDF, uploads it to Cloudinary, and removes the
// previous PDF file for this exact ticket (if any) so re-registrations
// never leave orphaned Cloudinary files behind. Does not mutate/save
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

  // ================= resource_type: "image" (NOT "raw") =================
  // Cloudinary blocks public delivery of "raw" PDF/ZIP files by default
  // on most accounts (a documented security restriction) unless the
  // account owner explicitly enables "Allow delivery of PDF and ZIP
  // files" in the Cloudinary console — without that, opening the
  // returned URL fails with an authorization error, which is exactly
  // what breaks "Download Ticket". Uploading the PDF as an "image"
  // resource instead (Cloudinary's documented, recommended way to host
  // PDFs) is not subject to that restriction, so the same URL always
  // opens/downloads correctly with no dashboard changes required.
  //
  // For "image" resources, Cloudinary appends the delivered extension
  // from `format` itself — unlike "raw", where the extension has to be
  // embedded directly in public_id (see the old public_id construction
  // this replaced) — so public_id here intentionally has NO ".pdf"
  // suffix; `format: "pdf"` is what makes the delivered secure_url end
  // in ".pdf".
  //
  // This does NOT change the WhatsApp "Download Ticket" button flow:
  // buildTicketDownloadBodyParams.js only strips the fixed
  // "https://res.cloudinary.com/" domain prefix and forwards everything
  // after it — it never depends on "raw" vs "image" appearing in the
  // path, so the existing button/template wiring keeps working exactly
  // as before with no changes there.
  const upload = await uploadToCloudinary(
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
      // Matches the "image" resource_type used above — deleting a
      // previously-uploaded ticket PDF must use the SAME resource_type
      // it was uploaded under, or Cloudinary's destroy call silently
      // targets the wrong resource and never actually removes the file.
      await deleteFromCloudinary(ticket.ticketPdfPublicId, "image");
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