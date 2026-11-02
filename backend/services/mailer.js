// Mailgun Email Service for Payment Failures and Official Receipts
// Uses Node.js 18+ built-in global fetch. Never crashes if env vars are unset.

const DEFAULT_BASE_URL = "https://api.mailgun.net/v3";

function isConfigured() {
  return Boolean(
    process.env.MAILGUN_API_KEY &&
    process.env.MAILGUN_DOMAIN &&
    process.env.MAILGUN_FROM
  );
}

/**
 * Sends an email via Mailgun HTTP API using built-in fetch.
 */
async function sendMailgunMessage({ to, subject, text, html }) {
  if (!isConfigured()) {
    console.warn("⚠️ Mailgun credentials not configured. Skipping email delivery:", {
      to,
      subject,
    });
    return { ok: false, skipped: true };
  }

  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM;
  const baseUrl = (process.env.MAILGUN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  const endpoint = `${baseUrl}/${domain}/messages`;

  const bodyParams = new URLSearchParams();
  bodyParams.append("from", from);
  bodyParams.append("to", to);
  bodyParams.append("subject", subject);
  if (text) bodyParams.append("text", text);
  if (html) bodyParams.append("html", html);

  const basicAuth = Buffer.from(`api:${apiKey}`).toString("base64");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Mailgun API returned error ${res.status}:`, errText);
      return { ok: false, error: errText };
    }

    const data = await res.json();
    console.log(`📧 Mailgun email sent successfully to ${to} (ID: ${data.id || "N/A"})`);
    return { ok: true, data };
  } catch (err) {
    console.error("❌ Failed to send email via Mailgun:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send alert email when a payment fails or is rejected.
 */
async function sendPaymentFailureEmail({ plate, amount, method, reason }) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@highway.lk";
  const subject = `🚨 Payment Failure Alert: Vehicle ${plate}`;

  const text = `
HIGHWAY AI ENFORCEMENT - PAYMENT FAILED
----------------------------------------
Vehicle Plate: ${plate}
Amount: LKR ${Number(amount).toLocaleString()}
Method: ${method}
Reason: ${reason || "Transaction declined or signature invalid"}
Time: ${new Date().toISOString()}

Please check the Exit Gate Kiosk and officer monitor.
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <h2 style="color: #dc2626; margin-top: 0;">🚨 Highway AI - Payment Failed Alert</h2>
      <p style="color: #475569; font-size: 14px;">A payment attempt for vehicle <strong>${plate}</strong> was declined or failed.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
        <tr style="background: #f8fafc;"><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Plate Number</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 16px;">${plate}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #dc2626;">LKR ${Number(amount).toLocaleString()}</td></tr>
        <tr style="background: #f8fafc;"><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Method</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${method}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Failure Reason</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #b91c1c;">${reason || "Transaction declined"}</td></tr>
        <tr style="background: #f8fafc;"><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Timestamp</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${new Date().toLocaleString()}</td></tr>
      </table>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">Southern Expressway Enforcement Control Center</p>
    </div>
  `;

  return sendMailgunMessage({ to: adminEmail, subject, text, html });
}

/**
 * Send official fine & toll receipt to user/admin upon successful payment.
 */
async function sendPaymentReceiptEmail({ plate, amount, method, reference, violations = [], toll = 0, recipientEmail }) {
  const to = recipientEmail || process.env.ADMIN_EMAIL || "driver@highway.lk";
  const subject = `🧾 HighWay AI Payment Receipt: ${plate} - ${reference}`;

  const violationRows = (violations || [])
    .map(
      (v) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">${v.type === "SEATBELT" ? "Seatbelt Violation" : `Speeding (${v.speed_kmh || "N/A"} km/h)`} (${v.nodeId || "Camera Node"})</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">LKR ${Number(v.fine_amount).toLocaleString()}</td>
    </tr>`
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 24px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #059669; margin: 0;">HighWay AI - Official Payment Receipt</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Southern Expressway (E01) Sri Lanka</p>
      </div>

      <p style="color: #334155; font-size: 14px;">Thank you. Your highway toll and violation clearance has been processed successfully.</p>

      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
        <tr style="background: #f1f5f9;"><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Vehicle Plate</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 16px; font-weight: bold;">${plate}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Payment Ref</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">${reference}</td></tr>
        <tr style="background: #f1f5f9;"><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Payment Method</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${method}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Highway Toll</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">LKR ${Number(toll).toLocaleString()}</td></tr>
        ${violationRows}
        <tr style="background: #ecfdf5; font-size: 16px;">
          <td style="padding: 10px; border: 1px solid #a7f3d0; font-weight: bold; color: #065f46;">TOTAL PAID</td>
          <td style="padding: 10px; border: 1px solid #a7f3d0; text-align: right; font-weight: bold; color: #065f46;">LKR ${Number(amount).toLocaleString()}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; padding: 12px; background: #ecfdf5; border-radius: 8px; border: 1px solid #6ee7b7; color: #065f46; font-size: 13px;">
        ✅ <strong>Gate Clearance:</strong> Exit gate barrier unlocked. Safe travels on the Southern Expressway!
      </div>

      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center;">Road Development Authority (RDA) Sri Lanka · HighWay AI Enforcement</p>
    </div>
  `;

  return sendMailgunMessage({
    to,
    subject,
    text: `Receipt for ${plate}: Total LKR ${amount} paid via ${method}. Ref: ${reference}`,
    html,
  });
}

module.exports = {
  sendPaymentFailureEmail,
  sendPaymentReceiptEmail,
};
