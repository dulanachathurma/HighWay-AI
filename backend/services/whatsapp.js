// WhatsApp Notification Service
// Sends WhatsApp alerts for Violations and Itemized Payment Receipts to +94767574844

const DEFAULT_PHONE = "94767574844";

/**
 * Clean phone number to international format (e.g., 0767574844 -> 94767574844)
 */
function normalizePhone(num) {
  if (!num) return DEFAULT_PHONE;
  let cleaned = String(num).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "94" + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Format an itemized WhatsApp receipt message
 */
function buildReceiptText({ plate, amount, method, reference, toll, violations = [] }) {
  const timestamp = new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" });
  
  let msg = `🚦 *HIGHWAY AI — OFFICIAL TOLL & FINE RECEIPT*\n`;
  msg += `🇱🇰 *Southern Expressway (E01)*\n`;
  msg += `─────────────────────────\n`;
  msg += `🚗 *Vehicle Number:* ${plate}\n`;
  msg += `📅 *Date & Time:* ${timestamp}\n`;
  msg += `💳 *Payment Method:* ${method}\n`;
  msg += `🔖 *Reference:* ${reference}\n`;
  msg += `─────────────────────────\n`;
  msg += `🛣️ *Highway Toll:* LKR ${Number(toll || 0).toLocaleString()}\n`;
  
  if (violations.length > 0) {
    msg += `🚨 *Fines Cleared:*\n`;
    violations.forEach((v) => {
      const typeLabel = v.type === "SEATBELT" ? "No Seatbelt" : `Speeding (${v.speed_kmh || ""} km/h)`;
      msg += `  • ${typeLabel}: LKR ${Number(v.fine_amount || 0).toLocaleString()}\n`;
    });
  } else {
    msg += `✅ *Fines:* None (Full Traffic Compliance)\n`;
  }

  msg += `─────────────────────────\n`;
  msg += `💰 *TOTAL PAID:* *LKR ${Number(amount).toLocaleString()}*\n`;
  msg += `🔓 *Status:* GATE BARRIER OPEN (Clearance Granted)\n`;
  msg += `─────────────────────────\n`;
  msg += `Safe travels on the Expressway! 🛣️✨`;

  return msg;
}

/**
 * Format violation alert message
 */
function buildViolationAlertText({ plate, type, speed_kmh, nodeId, fine_amount }) {
  const typeLabel = type === "SEATBELT" ? "Seatbelt Not Worn" : `Speeding (${speed_kmh} km/h)`;
  let msg = `⚠️ *HIGHWAY AI TRAFFIC VIOLATION ALERT*\n`;
  msg += `🇱🇰 *Southern Expressway E01*\n`;
  msg += `─────────────────────────\n`;
  msg += `🚗 *Vehicle:* ${plate}\n`;
  msg += `📍 *Node:* ${nodeId || "E01-01"}\n`;
  msg += `🚨 *Infraction:* ${typeLabel}\n`;
  msg += `💵 *Fine Amount:* LKR ${Number(fine_amount).toLocaleString()}\n`;
  msg += `🚧 *Notice:* Vehicle will be locked at Exit Toll Gate until settled.\n`;
  return msg;
}

/**
 * Send WhatsApp message using CallMeBot API or log payload if key unset
 */
async function sendWhatsAppMessage({ phone, message }) {
  const targetPhone = normalizePhone(phone || process.env.WHATSAPP_PHONE || DEFAULT_PHONE);
  const apiKey = process.env.CALLMEBOT_API_KEY || process.env.WHATSAPP_API_KEY;

  console.log(`📱 [WhatsApp Notification Engine] Preparing dispatch to +${targetPhone}`);

  if (apiKey) {
    try {
      // CallMeBot Free WhatsApp API: https://api.callmebot.com/whatsapp.php?phone=[phone]&text=[text]&apikey=[apikey]
      const url = `https://api.callmebot.com/whatsapp.php?phone=+${targetPhone}&text=${encodeURIComponent(
        message
      )}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✅ [WhatsApp] Message successfully delivered to +${targetPhone}`);
        return { success: true };
      }
    } catch (err) {
      console.error(`❌ [WhatsApp API Error]:`, err.message);
    }
  }

  // Fallback: Log full formatted message ready for direct WhatsApp dispatch
  console.log(
    `📱 [WhatsApp Message Ready for +${targetPhone}]:\n${message}\n` +
    `🔗 Direct WhatsApp Link: https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
  );

  return { success: true, simulated: true };
}

async function sendPaymentReceiptWhatsApp({ plate, amount, method, reference, toll, violations = [], phone }) {
  const text = buildReceiptText({ plate, amount, method, reference, toll, violations });
  return sendWhatsAppMessage({ phone, message: text });
}

async function sendViolationAlertWhatsApp({ plate, type, speed_kmh, nodeId, fine_amount, phone }) {
  const text = buildViolationAlertText({ plate, type, speed_kmh, nodeId, fine_amount });
  return sendWhatsAppMessage({ phone, message: text });
}

module.exports = {
  DEFAULT_PHONE,
  normalizePhone,
  buildReceiptText,
  sendWhatsAppMessage,
  sendPaymentReceiptWhatsApp,
  sendViolationAlertWhatsApp,
};
