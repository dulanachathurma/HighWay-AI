const mongoose = require("mongoose");

// One document per vehicle trip on the highway (entry -> interchange exit)
const sessionSchema = new mongoose.Schema({
  plate: { type: String, required: true, index: true },
  entry_node: String,
  entry_time: { type: Date, default: Date.now },
  exit_time: Date,
  toll_paid: { type: Boolean, default: false },
  status: { type: String, enum: ["ACTIVE", "EXITED"], default: "ACTIVE" },
});

module.exports = mongoose.model("VehicleSession", sessionSchema);
