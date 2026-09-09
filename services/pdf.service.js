// services/pdf.service.js
//
// Generates ONE attendee's individual ticket PDF and uploads it to the
// project's existing Cloudinary setup (utils/cloudinary.util.js — no
// second storage system is introduced). Used by
// services/ticketDelivery.service.js right after a BookingTicket
// finishes registration (Public or Private) so every registered person
// gets their OWN PDF, containing:
//   - Event Image
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

const PDFDocument = require("pdfkit");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");

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
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const contentWidth = pageRight - pageLeft;

      // ================= EVENT IMAGE =================
      if (eventImageBuffer) {
        try {
          doc.image(eventImageBuffer, pageLeft, doc.y, {
            fit: [contentWidth, 220],
            align: "center",
          });
          doc.moveDown(0.5);
        } catch (error) {
          console.error("Ticket PDF: failed to embed event image:", error.message);
        }
      }

      // ================= EVENT NAME =================
      doc
        .fontSize(22)
        .fillColor("#111111")
        .font("Helvetica-Bold")
        .text(safeText(event?.title, "Event"), pageLeft, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(1);
      doc
        .moveTo(pageLeft, doc.y)
        .lineTo(pageRight, doc.y)
        .strokeColor("#dddddd")
        .stroke();
      doc.moveDown(1);

      const contentTop = doc.y;
      const photoSize = 110;
      const photoX = pageRight - photoSize;

      // ================= USER PHOTO =================
      if (userPhotoBuffer) {
        try {
          doc.image(userPhotoBuffer, photoX, contentTop, {
            width: photoSize,
            height: photoSize,
            fit: [photoSize, photoSize],
          });
        } catch (error) {
          console.error("Ticket PDF: failed to embed user photo:", error.message);
        }
      }

      // ================= ATTENDEE / REGISTRATION FIELDS =================
      const textWidth = photoX - pageLeft - 20;

      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#111111")
        .text("Attendee Details", pageLeft, contentTop, {
          width: textWidth,
          underline: true,
        });

      doc.moveDown(0.6);

      const detailLine = (label, value) => {
        const startY = doc.y;

        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#333333")
          .text(`${label}:`, pageLeft, startY, { width: textWidth });

        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#000000")
          .text(safeText(value), pageLeft, doc.y, { width: textWidth });

        doc.moveDown(0.5);
      };

      // "All registration fields actually entered by that person" —
      // this project's registration form (bookingTicket.service.js /
      // publicRegistration.service.js) only ever collects Name, Mobile
      // Number and Email, so those three (as actually saved on THIS
      // ticket's own `attendee`) are what's printed here.
      detailLine("Full Name", ticket?.attendee?.name);
      detailLine("Phone Number", ticket?.attendee?.mobileNumber);
      detailLine("Email", ticket?.attendee?.email);
      detailLine("Ticket Name", ticketType?.ticketName);
      detailLine("Booking Number", ticket?.bookingNumber || booking?.bookingNumber);
      detailLine("Registration No.", ticket?.ticketNumber);

      doc.y = Math.max(doc.y, contentTop + photoSize) + 15;

      doc
        .moveTo(pageLeft, doc.y)
        .lineTo(pageRight, doc.y)
        .strokeColor("#dddddd")
        .stroke();
      doc.moveDown(1);

      // ================= QR CODE (THIS TICKET'S OWN, REUSED AS-IS) =================
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .fillColor("#111111")
        .text("Entry QR Code", pageLeft, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(0.5);

      const qrSize = 200;
      const qrX = pageLeft + (contentWidth - qrSize) / 2;

      if (qrImageBuffer) {
        try {
          doc.image(qrImageBuffer, qrX, doc.y, {
            width: qrSize,
            height: qrSize,
          });
          doc.y += qrSize + 10;
        } catch (error) {
          console.error("Ticket PDF: failed to embed QR image:", error.message);
          doc.moveDown(1);
        }
      } else {
        doc.moveDown(1);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#111111")
        .text(safeText(ticket?.ticketNumber), pageLeft, doc.y, {
          width: contentWidth,
          align: "center",
        });

      doc.moveDown(1.5);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#888888")
        .text(
          "Please present this ticket (QR code) at the event entry. This ticket is valid only for the registered attendee named above.",
          pageLeft,
          doc.y,
          { width: contentWidth, align: "center" }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// ================= GENERATE + UPLOAD ONE TICKET'S PDF =================
// Builds THIS ticket's PDF, uploads it to Cloudinary as a "raw" resource
// (so it gets its own stable, publicly accessible URL — not a
// blob/localhost path), and removes the previous PDF file for this
// exact ticket (if any) so re-registrations never leave orphaned
// Cloudinary files behind. Does not mutate/save the `ticket` document —
// callers (services/ticketDelivery.service.js) are responsible for
// persisting the returned url/public_id.
const generateAndUploadTicketPdf = async ({ event, ticketType, booking, ticket }) => {
  const buffer = await buildTicketPdfBuffer({ event, ticketType, booking, ticket });

  // Unique, human-traceable public_id per generation (ticketNumber +
  // timestamp) so a re-registration's new PDF never collides with — or
  // silently overwrites while still referenced by — an in-flight
  // WhatsApp send using the previous URL.
  //
  // The ".pdf" extension is embedded directly in the public_id itself
  // (NOT passed as a separate `format` option) because for
  // resource_type "raw", Cloudinary treats the public_id as the literal,
  // full file identifier — it does not auto-append a delivered
  // extension based on `format` the way it does for "image"/"video"
  // resources. Passing `format` here would either be ignored or, worse,
  // produce a "<public_id>.pdf.pdf" URL. Embedding ".pdf" in public_id
  // is the correct, documented way to get a delivered URL that ends in
  // ".pdf" for a raw upload, which is what lets the WhatsApp "Download
  // Ticket" button open/download it as a proper PDF.
  const safeTicketNumber = String(ticket?.ticketNumber || ticket?._id || "ticket").replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );
  const publicId = `${safeTicketNumber}-${Date.now()}.pdf`;

  const upload = await uploadToCloudinary(
    buffer,
    "event-management/ticket-pdfs",
    "raw",
    {
      public_id: publicId,
    }
  );

  if (ticket?.ticketPdfPublicId) {
    try {
      await deleteFromCloudinary(ticket.ticketPdfPublicId, "raw");
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