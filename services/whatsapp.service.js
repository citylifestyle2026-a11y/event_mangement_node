const AppError = require("../utils/AppError");

// ================= LOG MASKING HELPER =================
// Shows just enough of the API key to confirm the RIGHT key is loaded
// (e.g. to tell a stale/rotated key apart from the current one) without
// ever printing anything usable.
const maskSecret = (value) => {
  if (!value) return "(missing)";
  const str = String(value);
  if (str.length <= 8) return "****";
  return `${str.slice(0, 4)}...${str.slice(-4)} (len:${str.length})`;
};

// ================= CHATBOX WHATSAPP CONFIG =================
// Read lazily inside each call (not at module load) so a missing/misconfigured
// env var surfaces as a clear AppError at call time instead of a silent
// undefined baked in at require-time, and so tests can set process.env
// before invoking these functions.
//
// Also logs, on every call, exactly what was actually loaded from
// process.env at that moment — this is the #1 thing to check first: if
// this log block doesn't appear at all, sendImageMessage/sendTextMessage
// was never called. If it appears but shows "(missing)", dotenv either
// isn't loaded before this module runs, or the .env file doesn't have
// that key.
const getChatboxConfig = () => {
  const baseUrl = process.env.CHATBOX_BASE_URL;
  const apiKey = process.env.CHATBOX_API_KEY;
  const phoneNumberId = process.env.CHATBOX_PHONE_NUMBER_ID;

  console.log("[WhatsApp][ENV CHECK] CHATBOX_BASE_URL        =", baseUrl || "(missing)");
  console.log("[WhatsApp][ENV CHECK] CHATBOX_PHONE_NUMBER_ID =", phoneNumberId || "(missing)");
  console.log("[WhatsApp][ENV CHECK] CHATBOX_API_KEY         =", maskSecret(apiKey));

  if (!baseUrl || !apiKey || !phoneNumberId) {
    const missing = [
      !baseUrl && "CHATBOX_BASE_URL",
      !apiKey && "CHATBOX_API_KEY",
      !phoneNumberId && "CHATBOX_PHONE_NUMBER_ID",
    ].filter(Boolean);

    console.error(
      "[WhatsApp][CONFIG ERROR] Missing required environment variable(s):",
      missing.join(", ")
    );

    // Never interpolate/log the actual key — only report which names are missing.
    throw new AppError(
      `WhatsApp (Chatbox) is not configured. Missing required environment variable(s): ${missing.join(", ")}`,
      500
    );
  }

  return { baseUrl, apiKey, phoneNumberId };
};

// ================= PHONE NUMBER NORMALIZATION =================
// ROOT-CAUSE FIX (see chat report): createBookingValidation enforces
// Booking.mobileNumber to be exactly 10 numeric digits (a bare Indian
// local number with no country code, e.g. "9876543210"). That raw value
// was being sent to Chatbox as-is in the "to" field. Chatbox's payload
// shape here (messaging_product/recipient_type/to/type) is the standard
// WhatsApp Cloud API contract, which requires "to" in international
// format WITHOUT a leading "+" (e.g. "919876543210") — a bare 10-digit
// local number is not a valid WhatsApp recipient ID, so Chatbox either
// rejects the request or silently fails to deliver it, while the
// booking itself still succeeds because this call is intentionally
// non-blocking (see sendBookingWhatsAppNotifications in
// booking.service.js). That mismatch is why bookings "succeed" but no
// message ever arrives.
//
// This only reshapes the string used for the WhatsApp API call — it
// does NOT touch Booking.mobileNumber in the database, so booking
// records, search-by-mobile, exports, etc. are all unaffected.
//
// CHATBOX_DEFAULT_COUNTRY_CODE is optional (defaults to "91" / India).
// Set it in .env if bookings are ever taken for a different country.
const normalizePhoneForWhatsApp = (rawPhone) => {
  const digitsOnly = String(rawPhone).replace(/[^\d]/g, "");
  const defaultCountryCode = (process.env.CHATBOX_DEFAULT_COUNTRY_CODE || "91").replace(/[^\d]/g, "");

  let normalized = digitsOnly;

  if (digitsOnly.length === 10) {
    // Bare local number (the shape createBookingValidation actually
    // enforces) — prepend the default country code.
    normalized = `${defaultCountryCode}${digitsOnly}`;
  }
  // Anything already longer than 10 digits is assumed to already
  // include a country code and is left as-is.

  if (normalized !== digitsOnly) {
    console.log(
      `[WhatsApp][PHONE NORMALIZE] "${rawPhone}" -> "${normalized}" (prepended country code "${defaultCountryCode}")`
    );
  } else {
    console.log(`[WhatsApp][PHONE NORMALIZE] "${rawPhone}" -> "${normalized}" (no change)`);
  }

  return normalized;
};

// ================= SEND CHATBOX REQUEST =================
// Shared low-level POST used by both message senders below. Mirrors the
// project's AppError-based error style (see qr.service.js / booking.service.js)
// instead of throwing raw fetch/HTTP errors.
const sendChatboxRequest = async (payload) => {
  const { baseUrl, apiKey, phoneNumberId } = getChatboxConfig();

  const url = `${baseUrl}/${phoneNumberId}/messages`;

  // ---- BEFORE THE CALL ----
  // URL is safe to log in full: apiKey travels only as a header value,
  // never as part of the URL.
  console.log("[WhatsApp][REQUEST] URL:", url);
  console.log("[WhatsApp][REQUEST] Method: POST");
  console.log("[WhatsApp][REQUEST] Headers:", {
    "Content-Type": "application/json",
    apikey: maskSecret(apiKey),
  });
  console.log("[WhatsApp][REQUEST] Payload fields:", {
    to: payload.to,
    type: payload.type,
    ...(payload.type === "image"
      ? { imageUrl: payload.image?.link, hasCaption: Boolean(payload.image?.caption) }
      : {}),
    ...(payload.type === "text" ? { messageLength: payload.text?.body?.length } : {}),
  });

  let response;
  const startedAt = Date.now();

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
    console.error("[WhatsApp][NETWORK ERROR] Failed to reach Chatbox API:", error.message);
    throw new AppError(
      `Failed to reach Chatbox WhatsApp API: ${error.message}`,
      502
    );
  }

  const durationMs = Date.now() - startedAt;

  let data;
  let rawBody = null;

  try {
    rawBody = await response.clone().text();
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch (error) {
    data = null;
  }

  // ---- AFTER THE CALL ----
  console.log(`[WhatsApp][RESPONSE] Status: ${response.status} ${response.statusText} (${durationMs}ms)`);
  console.log("[WhatsApp][RESPONSE] Body:", rawBody || "(empty body)");

  // ================= BODY-LEVEL SUCCESS CHECK =================
  // Chatbox can return HTTP 200 (response.ok === true) while the
  // message itself still failed — e.g. the exact case reported:
  //   { "code": 100, "status": "failed", "message": "Insufficient Balance" }
  // So response.ok alone is NOT sufficient to call this a success.
  // When the body includes a "status" field, that field is authoritative:
  // only "status": "success" counts as success — "failed" (or any other
  // value) is a failure regardless of the HTTP status code. If the body
  // has no "status" field at all, fall back to the plain HTTP status.
  const hasStatusField = Boolean(data) && typeof data === "object" && "status" in data;
  const bodyIndicatesFailure = hasStatusField && data.status !== "success";
  const isSuccess = response.ok && !bodyIndicatesFailure;

  if (!isSuccess) {
    // Some Chatbox/Cloud-API-style error bodies nest the real reason as
    // an object (e.g. { error: { message, code } }) rather than a plain
    // string — stringify-log-friendly extraction so the log/thrown
    // message is always human-readable instead of "[object Object]".
    const nestedErrorMessage =
      data && data.error && typeof data.error === "object"
        ? data.error.message
        : null;

    const errorMessage =
      nestedErrorMessage ||
      (data && typeof data.message === "string" && data.message) ||
      (data && typeof data.error === "string" && data.error) ||
      `Chatbox WhatsApp API request failed with status ${response.status}`;

    console.error("[WhatsApp][API ERROR] Chatbox rejected the message:", {
      httpStatus: response.status,
      statusText: response.statusText,
      bodyStatus: hasStatusField ? data.status : "(no status field in body)",
      bodyCode: data && data.code,
      reason: errorMessage,
      body: data || rawBody,
    });

    throw new AppError(errorMessage, response.ok ? 502 : response.status || 502);
  }

  console.log("[WhatsApp][SUCCESS] Chatbox accepted the message. Response body above confirms acceptance — this does NOT yet confirm phone delivery, only that Chatbox queued/sent it.");

  return data;
};

// ================= SEND IMAGE MESSAGE =================
// phone: recipient WhatsApp number (e.g. Booking.mobileNumber)
// imageUrl: publicly reachable image URL (e.g. BookingTicket.qrImage from Cloudinary)
// caption: optional text shown with the image
const sendImageMessage = async ({ phone, imageUrl, caption }) => {
  console.log("[WhatsApp][CALL] sendImageMessage invoked with:", {
    phone,
    imageUrl,
    hasCaption: Boolean(caption),
  });

  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp image message requires a recipient phone number.", 400);
  }

  if (!imageUrl || !String(imageUrl).trim()) {
    throw new AppError("WhatsApp image message requires an imageUrl.", 400);
  }

  const normalizedPhone = normalizePhoneForWhatsApp(String(phone).trim());

  const payload = {
    messaging_product: "whatsapp",
    preview_url: false,
    recipient_type: "individual",
    to: normalizedPhone,
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
  console.log("[WhatsApp][CALL] sendTextMessage invoked with:", {
    phone,
    messageLength: message ? String(message).length : 0,
  });

  if (!phone || !String(phone).trim()) {
    throw new AppError("WhatsApp text message requires a recipient phone number.", 400);
  }

  if (!message || !String(message).trim()) {
    throw new AppError("WhatsApp text message requires a message body.", 400);
  }

  const normalizedPhone = normalizePhoneForWhatsApp(String(phone).trim());

  const payload = {
    messaging_product: "whatsapp",
    preview_url: false,
    recipient_type: "individual",
    to: normalizedPhone,
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
