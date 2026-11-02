// Mock payment gateway (kept as fallback when PAYMENT_PROVIDER=mock)
// Supports test cards for quick local testing.

const TEST_CARDS = {
  SUCCESS: ["4242424242424242", "1234567890123456", "MOCK"],
  FAIL: ["4000000000000002", "0000000000000000"],
};

async function charge({ plate, amount, method, cardNumber }) {
  await new Promise((r) => setTimeout(r, 600)); // Simulate gateway latency

  const normalizedMethod = String(method || "").toUpperCase();

  if (!["CASH", "CARD", "MOCK_CARD"].includes(normalizedMethod)) {
    return { success: false, error: "Unsupported payment method" };
  }
  if (!amount || amount <= 0) {
    return { success: false, error: "Invalid payment amount" };
  }

  // If card number is provided, test failure conditions
  if (cardNumber) {
    const cleanNum = String(cardNumber).replace(/[^0-9]/g, "");
    if (TEST_CARDS.FAIL.includes(cleanNum)) {
      return { success: false, error: "Mock card declined: Insufficient funds or invalid card" };
    }
  }

  return {
    success: true,
    reference: `MOCK-${Date.now()}-${plate.replace(/[^A-Z0-9]/g, "")}`,
  };
}

module.exports = { charge, TEST_CARDS };
