const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order_id: { type: String, required: true, unique: true, index: true },
    plate: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "LKR" },
    method: { type: String, required: true }, // "PAYHERE_CARD", "MOCK_CARD", "CASH"
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    payhere_ref: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
