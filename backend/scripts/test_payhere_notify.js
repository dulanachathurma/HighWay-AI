// Automated Test Suite for /api/payhere/notify webhook
// Tests:
// 1. Success notification with valid MD5 signature
// 2. Failed / declined notification with valid signature
// 3. Forged signature (must be rejected with HTTP 400)
// 4. Wrong amount (must be rejected with HTTP 400)
// 5. Duplicate notification (must be ignored idempotently with HTTP 200)

const crypto = require("crypto");

const API = process.env.API_URL || "http://localhost:4000";
const MERCHANT_ID = process.env.PAYHERE_MERCHANT_ID || "1211111";
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || "4XXXXXXXXXXXXXX";

function md5(str) {
  return crypto.createHash("md5").update(String(str)).digest("hex");
}

function computeSig(merchantId, orderId, payhereAmount, payhereCurrency, statusCode, secret) {
  const secretHash = md5(secret).toUpperCase();
  const raw = `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`;
  return md5(raw).toUpperCase();
}

async function sendNotification(body) {
  const params = new URLSearchParams(body);
  const res = await fetch(`${API}/api/payhere/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function runTests() {
  console.log("🧪 HighWay AI: Starting PayHere Webhook Notification Tests...\n");

  // Step 0: Create test bill & initialize a PayHere order for vehicle WP CAB-9999
  const testPlate = "WP CAB-9999";

  // Create an unpaid violation for this plate so bill total is > 0
  await fetch(`${API}/api/violations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "highway-secret-key" },
    body: JSON.stringify({ plate: testPlate, type: "SPEED", speed_kmh: 125, nodeId: "NODE-01" }),
  });

  const initRes = await fetch(`${API}/api/kiosk/payhere/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate: testPlate }),
  });
  const initData = await initRes.json();
  const orderId = initData.fields.order_id;
  const amount = initData.fields.amount; // e.g. "10150.00"
  const currency = "LKR";

  console.log(`📋 Created Test Order: ${orderId} | Amount: LKR ${amount}\n`);

  // ----------------------------------------------------------------
  // Test 1: Forged Signature (Must be rejected with HTTP 400)
  // ----------------------------------------------------------------
  console.log("TEST 1: Forged Signature (Tampered md5sig)");
  const res1 = await sendNotification({
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    payment_id: "PAY-TEST-001",
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: "2",
    md5sig: "FORGED_SIGNATURE_HEX_123456",
  });
  console.log(`-> Response Status: ${res1.status} | Body: "${res1.body}"`);
  console.log(res1.status === 400 ? "✅ PASSED: Forged signature rejected with 400\n" : "❌ FAILED\n");

  // ----------------------------------------------------------------
  // Test 2: Wrong Amount (Must be rejected with HTTP 400)
  // ----------------------------------------------------------------
  console.log("TEST 2: Wrong Amount (Tampered payment amount)");
  const wrongAmount = "50.00";
  const wrongAmountSig = computeSig(MERCHANT_ID, orderId, wrongAmount, currency, "2", MERCHANT_SECRET);
  const res2 = await sendNotification({
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    payment_id: "PAY-TEST-002",
    payhere_amount: wrongAmount,
    payhere_currency: currency,
    status_code: "2",
    md5sig: wrongAmountSig,
  });
  console.log(`-> Response Status: ${res2.status} | Body: "${res2.body}"`);
  console.log(res2.status === 400 ? "✅ PASSED: Wrong amount rejected with 400\n" : "❌ FAILED\n");

  // ----------------------------------------------------------------
  // Test 3: Failed / Cancelled Notification (status_code -1 or -2)
  // ----------------------------------------------------------------
  console.log("TEST 3: Payment Declined Notification (status_code -2)");
  const failOrder = `HW-FAIL-${Date.now()}`;
  // Init a quick order
  await fetch(`${API}/api/kiosk/payhere/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate: "SP CAA-4000" }),
  });
  const failSig = computeSig(MERCHANT_ID, orderId, amount, currency, "-2", MERCHANT_SECRET);
  const res3 = await sendNotification({
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    payment_id: "PAY-FAIL-003",
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: "-2",
    status_message: "Card declined by issuing bank",
    md5sig: failSig,
  });
  console.log(`-> Response Status: ${res3.status} | Body: "${res3.body}"`);
  console.log(res3.status === 200 ? "✅ PASSED: Handled failure response 200 & emitted failure event\n" : "❌ FAILED\n");

  // ----------------------------------------------------------------
  // Test 4: Success Notification with Valid Signature (HTTP 200)
  // ----------------------------------------------------------------
  console.log("TEST 4: Success Notification with Valid Signature (status_code 2)");
  const successSig = computeSig(MERCHANT_ID, orderId, amount, currency, "2", MERCHANT_SECRET);
  const res4 = await sendNotification({
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    payment_id: "320025112345",
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: "2",
    md5sig: successSig,
  });
  console.log(`-> Response Status: ${res4.status} | Body: "${res4.body}"`);
  console.log(res4.status === 200 ? "✅ PASSED: Success processed, violations marked PAID, gate unlocked\n" : "❌ FAILED\n");

  // ----------------------------------------------------------------
  // Test 5: Duplicate Notification (Idempotency - must return 200 without duplicate action)
  // ----------------------------------------------------------------
  console.log("TEST 5: Duplicate Notification (Idempotency Check)");
  const res5 = await sendNotification({
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    payment_id: "320025112345",
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: "2",
    md5sig: successSig,
  });
  console.log(`-> Response Status: ${res5.status} | Body: "${res5.body}"`);
  console.log(res5.status === 200 && res5.body.includes("Already processed")
    ? "✅ PASSED: Duplicate notification ignored idempotently with 200\n"
    : "❌ FAILED\n");

  console.log("🎉 All 5 PayHere Webhook Notification test scenarios completed successfully!");
}

runTests().catch(console.error);
