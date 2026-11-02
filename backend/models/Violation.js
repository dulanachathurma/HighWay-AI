const mongoose = require("mongoose");

const violationSchema = new mongoose.Schema(
  {
    plate: { type: String, required: true, index: true },
    type: { type: String, enum: ["SPEED", "SEATBELT", "AVG_SPEED"], required: true },
    speed_kmh: Number,
    nodeId: String,
    fine_amount: { type: Number, required: true },
    status: { type: String, enum: ["UNPAID", "PAID"], default: "UNPAID", index: true },
    evidence: String, // small base64 jpeg of the vehicle
    paid_at: Date,
    payment_ref: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Violation", violationSchema);
