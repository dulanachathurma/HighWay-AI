// PayHere Checkout and Webhook Verification Service
// Uses Node.js built-in crypto module for hashing.
const crypto = require("crypto");

const PAYHERE_SANDBOX_URL = "https://sandbox.payhere.lk/pay/checkout";

function md5(str) {
  return crypto.createHash("md5").update(String(str)).digest("hex");
}

/**
 * Generates the PayHere security hash for checkout.
 * hash = MD5(merchant_id + order_id + amount_formatted + currency + MD5(merchant_secret).toUpperCase()).toUpperCase()
 */
function generateHash(merchantId, orderId, amountFormatted, currency, merchantSecret) {
  const secretHash = md5(merchantSecret).toUpperCase();
  const rawString = `${merchantId}${orderId}${amountFormatted}${currency}${secretHash}`;
  return md5(rawString).toUpperCase();
}

/**
 * Builds all fields required for the PayHere Sandbox checkout form.
 */
function buildCheckoutFields({ orderId, amount, plate }) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID || "1211111";
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || "4XXXXXXXXXXXXXX";
  const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:4000";

  const amountFormatted = Number(amount).toFixed(2);
  const currency = "LKR";

  const hash = generateHash(merchantId, orderId, amountFormatted, currency, merchantSecret);

  return {
    action_url: PAYHERE_SANDBOX_URL,
    fields: {
      merchant_id: merchantId,
      return_url: `${clientOrigin}/?payment=return&order_id=${encodeURIComponent(orderId)}`,
      cancel_url: `${clientOrigin}/?payment=cancel&order_id=${encodeURIComponent(orderId)}`,
      notify_url: `${publicBaseUrl}/api/payhere/notify`,
      order_id: orderId,
      items: `HighWay AI Toll & Fine - ${plate}`,
      currency,
      amount: amountFormatted,
      hash,
      // Customer details (required by PayHere)
      first_name: "Highway",
      last_name: `Driver (${plate})`,
      email: `driver.${plate.replace(/[^A-Z0-9]/g, "").toLowerCase()}@highway.lk`,
      phone: "0771234567",
      address: "Southern Expressway Toll Plaza",
      city: "Galle",
      country: "Sri Lanka",
      // Custom tracking
      custom_1: plate,
    },
  };
}

/**
 * Verifies the incoming PayHere webhook notification signature.
 * local_sig = MD5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + MD5(merchant_secret).toUpperCase()).toUpperCase()
 */
function verifyNotification(body) {
  if (!body) return false;

  const merchantId = process.env.PAYHERE_MERCHANT_ID || "1211111";
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || "4XXXXXXXXXXXXXX";

  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
  } = body;

  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || status_code === undefined || !md5sig) {
    return false;
  }

  // Merchant ID must match
  if (String(merchant_id) !== String(merchantId)) {
    return false;
  }

  const secretHash = md5(merchantSecret).toUpperCase();
  const rawString = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`;
  const localSig = md5(rawString).toUpperCase();

  return localSig === String(md5sig).toUpperCase();
}

module.exports = {
  PAYHERE_SANDBOX_URL,
  generateHash,
  buildCheckoutFields,
  verifyNotification,
};
