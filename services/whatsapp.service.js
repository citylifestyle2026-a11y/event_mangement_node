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
    const errorMessage =
      (data && (data.message || data.error)) ||
      `Chatbox WhatsApp API request failed with status ${response.status}`;

    throw new AppError(errorMessage, response.status || 502);
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
  sendTextMessage,
};