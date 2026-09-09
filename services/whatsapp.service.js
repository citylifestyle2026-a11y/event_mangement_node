const AppError = require("../utils/AppError");

// ================= CHATBOX WHATSAPP CONFIG =================
// Read lazily inside each call (not at module load) so a missing/misconfigured
// env var surfaces as a clear AppError at call time instead of a silent
// undefined baked in at require-time, and so tests can set process.env
// before invoking these functions.
const getChatboxConfig = () => {
  const baseUrl = process.env.CHATBOX_BASE_URL;
  const apiKey = process.env.CHATBOX_API_KEY;
  const phoneNumberId = process.env.CHATBOX_PHONE_NUMBER_ID;

  if (!baseUrl || !apiKey || !phoneNumberId) {
    // Never interpolate/log the actual key — only report which names are missing.
    throw new AppError(
      "WhatsApp (Chatbox) is not configured. Missing required environment variable(s).",
      500
    );
  }

  return { baseUrl, apiKey, phoneNumberId };
};

// ================= SEND CHATBOX REQUEST =================
// Shared low-level POST used by both message senders below. Mirrors the
// project's AppError-based error style (see qr.service.js / booking.service.js)
// instead of throwing raw fetch/HTTP errors.
const sendChatboxRequest = async (payload) => {
  const { baseUrl, apiKey, phoneNumberId } = getChatboxConfig();

  const url = `${baseUrl}/${phoneNumberId}/messages`;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Network-level failure (DNS, timeout, connection refused, etc).
    // error.message from a fetch failure does not contain the apikey
    // (it was sent as a header value, never echoed back by the client),
    // so it is safe to surface as-is.
    throw new AppError(
      `Failed to reach Chatbox WhatsApp API: ${error.message}`,
      502
    );
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

if (!response.ok) {
  console.error(
    "========== CHATBOX API ERROR =========="
  );

  console.error(
    "Status:",
    response.status
  );

  console.error(
    "Response:",
    JSON.stringify(data, null, 2)
  );

  console.error(
    "======================================"
  );

  let errorMessage;

  if (typeof data?.message === "string") {
    errorMessage = data.message;
  } else if (typeof data?.error === "string") {
    errorMessage = data.error;
  } else if (data?.error) {
    errorMessage = JSON.stringify(data.error);
  } else {
    errorMessage = JSON.stringify(data);
  }

  throw new AppError(
    errorMessage,
    response.status || 502
  );
}

  return data;
};

// ================= SEND IMAGE MESSAGE =================
// phone: recipient WhatsApp number (e.g. Booking.mobileNumber)
// imageUrl: publicly reachable image URL (e.g. BookingTicket.qrImage from Cloudinary)
// caption: optional text shown with the image
const sendImageMessage = async ({ phone, imageUrl, caption }) => {
  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp image message requires a recipient phone number.", 400);
  }

  if (!imageUrl || !String(imageUrl).trim()) {
    throw new AppError("WhatsApp image message requires an imageUrl.", 400);
  }

  const payload = {
    messaging_product: "whatsapp",
    preview_url: false,
    recipient_type: "individual",
    to: String(phone).trim(),
    type: "image",
    image: {
      link: String(imageUrl).trim(),
      ...(caption ? { caption: String(caption) } : {}),
    },
  };

  return sendChatboxRequest(payload);
};

// ================= SEND MEDIA TEMPLATE MESSAGE =================
// Used to deliver an image (e.g. a booking's QR code) together with an
// approved WhatsApp template. Required whenever the customer-service
// 24-hour session window is closed — WhatsApp rejects a free-form
// sendImageMessage in that case with error 131047 ("Re-engagement
// message"). This is why services/booking.service.js's
// sendBookingWhatsAppNotifications and services/bookingTicket.service.js's
// resendTicket both use this function instead of sendImageMessage for
// the booking QR notification. Payload shape matches the Chatbox
// "Send Media Template Message" API exactly (see
// CHATBOX_PARTNERS_API_DOCUMENTATION, section 9): a template with a
// "header" component carrying the image, and a "body" component
// carrying the {{1}}, {{2}}, ... text parameters.
//
// phone: recipient WhatsApp number (e.g. Booking.mobileNumber)
// templateName: the exact, already-approved template name
//   (e.g. process.env.CHATBOX_QR_TEMPLATE_NAME)
// languageCode: the template's approved language code
//   (e.g. process.env.CHATBOX_QR_TEMPLATE_LANGUAGE)
// imageUrl: publicly reachable image URL used as the template's header
//   (e.g. BookingTicket.qrImage from Cloudinary)
// bodyParams: ordered array of strings filling the template's {{1}},
//   {{2}}, ... body placeholders, in order — see
//   utils/buildQrNotificationBodyParams.js for this project's exact
//   mapping for the "event_booking_qr_pass" template.
const sendMediaTemplateMessage = async ({
  phone,
  templateName,
  languageCode,
  imageUrl,
  bodyParams = [],
}) => {
  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp template message requires a recipient phone number.", 400);
  }

  if (!templateName || !String(templateName).trim()) {
    throw new AppError("WhatsApp template message requires a templateName.", 400);
  }

  if (!languageCode || !String(languageCode).trim()) {
    throw new AppError("WhatsApp template message requires a languageCode.", 400);
  }

  if (!imageUrl || !String(imageUrl).trim()) {
    throw new AppError("WhatsApp template message requires an imageUrl for the header.", 400);
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(phone).trim(),
    type: "template",
    template: {
      name: String(templateName).trim(),
      language: {
        code: String(languageCode).trim(),
      },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: String(imageUrl).trim(),
              },
            },
          ],
        },
        {
          type: "body",
          parameters: bodyParams.map((value) => ({
            type: "text",
            text: String(value ?? ""),
          })),
        },
      ],
    },
  };

  return sendChatboxRequest(payload);
};

// ================= SEND TEMPLATE MESSAGE (BODY ONLY) =================
// Used for approved WhatsApp templates that have NO header/media
// component -- e.g. the public-registration-link template
// ("event_registration_link", see
// utils/buildRegistrationBodyParams.js for its exact {{1}}-{{4}}
// mapping). Kept entirely separate from sendMediaTemplateMessage above
// (which always attaches an image header for the QR template) so the
// existing QR WhatsApp flow can never be affected by changes made here.
//
// phone: recipient WhatsApp number (e.g. Booking.mobileNumber)
// templateName: the exact, already-approved template name
//   (e.g. process.env.CHATBOX_REGISTRATION_TEMPLATE_NAME)
// languageCode: the template's approved language code
//   (e.g. process.env.CHATBOX_REGISTRATION_TEMPLATE_LANGUAGE)
// bodyParams: ordered array of strings filling the template's {{1}},
//   {{2}}, ... body placeholders, in order
// buttonParam: optional string value for the template's single Dynamic
//   URL "Visit Website" button (button index 0). When provided, a
//   `button` component (sub_type "url") is appended after the `body`
//   component, matching the Cloud-API component ordering/shape already
//   used above for the header/body components. Omitted entirely when
//   not provided, so templates with no button are unaffected.
const sendTemplateMessage = async ({
  phone,
  templateName,
  languageCode,
  bodyParams = [],
  buttonParam,
}) => {
  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp template message requires a recipient phone number.", 400);
  }

  if (!templateName || !String(templateName).trim()) {
    throw new AppError("WhatsApp template message requires a templateName.", 400);
  }

  if (!languageCode || !String(languageCode).trim()) {
    throw new AppError("WhatsApp template message requires a languageCode.", 400);
  }

  const components = [
    {
      type: "body",
      parameters: bodyParams.map((value) => ({
        type: "text",
        text: String(value ?? ""),
      })),
    },
  ];

  if (buttonParam !== undefined && buttonParam !== null && String(buttonParam).trim() !== "") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: String(buttonParam).trim(),
        },
      ],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(phone).trim(),
    type: "template",
    template: {
      name: String(templateName).trim(),
      language: {
        code: String(languageCode).trim(),
      },
      components,
    },
  };

  return sendChatboxRequest(payload);
};

// ================= SEND TEXT MESSAGE =================
// phone: recipient WhatsApp number
// message: plain text body
const sendTextMessage = async ({ phone, message }) => {
  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp text message requires a recipient phone number.", 400);
  }

  if (!message || !String(message).trim()) {
    throw new AppError("WhatsApp text message requires a message body.", 400);
  }

  const payload = {
    messaging_product: "whatsapp",
    preview_url: false,
    recipient_type: "individual",
    to: String(phone).trim(),
    type: "text",
    text: {
      body: String(message),
    },
  };

  return sendChatboxRequest(payload);
};

module.exports = {
  sendImageMessage,
  sendMediaTemplateMessage,
  sendTemplateMessage,
  sendTextMessage,
};