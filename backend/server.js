require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const config = require("./config");
const Violation = require("./models/Violation");
const VehicleSession = require("./models/VehicleSession");
const Payment = require("./models/Payment");
const User = require("./models/User");

const store = require("./services/store");
const payment = require("./services/payment");
const payhere = require("./services/payhere");
const mailer = require("./services/mailer");
const engine = require("./services/engine");
const { cleanPlate } = require("./services/plateUtils");

const JWT_SECRET = process.env.JWT_SECRET || "highway-ai-jwt-super-secret-key-2026";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || "*" },
  maxHttpBufferSize: 5e6, // Live frames are a few hundred KB
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true })); // Required for PayHere webhook POST

// ------------------------------------------------------------ Auth & JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin privilege required" });
  }
  next();
}

// ------------------------------------------------------------ Helpers
function requireApiKey(req, res, next) {
  if (req.headers["x-api-key"] !== (process.env.API_KEY || "highway-secret-key")) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
}

function speedFine(speed) {
  const tier = config.SPEED_FINES.find((t) => speed > t.over);
  return tier ? tier.amount : 0;
}

// Creates a violation (with duplicate protection) and notifies command center
async function createViolation({ plate, type, speed_kmh, nodeId, evidence }) {
  const fine_amount = type === "SEATBELT" ? config.FINE_SEATBELT : speedFine(speed_kmh);
  if (!fine_amount) return null; // Not actually a violation

  const since = new Date(Date.now() - config.DUPLICATE_WINDOW_MS);
  const duplicate = await Violation.findOne({ plate, type, createdAt: { $gte: since } });
  if (duplicate) return null;

  const violation = await Violation.create({
    plate,
    type,
    speed_kmh,
    nodeId,
    evidence,
    fine_amount,
  });
  io.emit("violation:new", violation);
  console.log(`🚨 ${type} violation  ${plate}  fine LKR ${fine_amount}`);
  return violation;
}

// Toll = distance from entry node to exit node
function calcToll(session) {
  if (!session) return config.TOLL_MIN;
  const from = config.NODES[session.entry_node];
  const to = config.NODES[config.EXIT_NODE];
  if (from === undefined || to === undefined) return config.TOLL_MIN;
  return Math.max(config.TOLL_MIN, Math.round(Math.abs(to - from) * config.TOLL_PER_KM));
}

async function buildBill(plate) {
  const session = await VehicleSession.findOne({ plate, status: "ACTIVE" });
  const fines = await Violation.find({ plate, status: "UNPAID" }).select("-evidence");
  const toll = session && session.toll_paid ? 0 : calcToll(session);
  const fines_total = fines.reduce((sum, v) => sum + v.fine_amount, 0);
  return { plate, toll, fines, fines_total, total: toll + fines_total };
}

// Shared settlement routine for both PayHere and Cash/Mock
async function settlePayment({ orderId, plate, amount, method, reference }) {
  // Update or create payment record
  let payRecord = null;
  if (orderId) {
    payRecord = await Payment.findOne({ order_id: orderId });
  }
  if (!payRecord) {
    payRecord = await Payment.create({
      order_id: orderId || `HW-${plate.replace(/[^A-Z0-9]/g, "")}-${Date.now()}`,
      plate,
      amount,
      currency: "LKR",
      method,
      status: "SUCCESS",
      payhere_ref: reference,
    });
  } else {
    payRecord.status = "SUCCESS";
    payRecord.payhere_ref = reference;
    await payRecord.save();
  }

  // Retrieve unpaid fines before updating to attach in email
  const unpaidFines = await Violation.find({ plate, status: "UNPAID" });
  const activeSession = await VehicleSession.findOne({ plate, status: "ACTIVE" });
  const tollAmount = activeSession && activeSession.toll_paid ? 0 : calcToll(activeSession);

  // Mark all pending violations as paid
  await Violation.updateMany(
    { plate, status: "UNPAID" },
    { status: "PAID", paid_at: new Date(), payment_ref: reference }
  );

  // Close active highway sessions
  await VehicleSession.updateMany(
    { plate, status: "ACTIVE" },
    { status: "EXITED", exit_time: new Date(), toll_paid: true }
  );

  // Real-time broadcast to all kiosks and command centers
  io.emit("payment:success", { plate, amount, method, reference });
  io.emit("gate:scan", { plate, status: "OPEN", unpaid_total: 0, violations: 0 });

  // Send official payment receipt via Mailgun (non-blocking)
  mailer
    .sendPaymentReceiptEmail({
      plate,
      amount,
      method,
      reference,
      violations: unpaidFines,
      toll: tollAmount,
    })
    .catch((err) => console.error("Receipt email error:", err.message));

  return payRecord;
}

// ------------------------------------------------------------ Authentication Endpoints
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = await User.findOne({ username: String(username).toLowerCase().trim() });
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: { username: user.username, role: user.role, name: user.name },
  });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ------------------------------------------------------------ Public Config & Southern Expressway Nodes
app.get("/api/config/public", (req, res) => {
  res.json({
    provider: process.env.PAYMENT_PROVIDER || "mock",
    speedLimit: config.SPEED_LIMIT,
    exitNode: config.EXIT_NODE,
    tollPerKm: config.TOLL_PER_KM,
  });
});

app.get("/api/nodes", (req, res) => {
  res.json({
    nodes: config.NODES,
    nodeNames: config.NODE_NAMES,
    speedLimit: config.SPEED_LIMIT,
    exitNode: config.EXIT_NODE,
    tollPerKm: config.TOLL_PER_KM,
  });
});

// ------------------------------------------------------------ Camera Node APIs
app.post("/api/violations", requireApiKey, async (req, res) => {
  const plate = cleanPlate(req.body.plate);
  if (!plate) return res.status(400).json({ error: "Plate is required" });

  const violation = await createViolation({ ...req.body, plate });
  res.json({ created: !!violation });
});

app.post("/api/sightings", requireApiKey, async (req, res) => {
  const plate = cleanPlate(req.body.plate);
  const { nodeId } = req.body;
  const ts = Number(req.body.timestamp) || Date.now();
  if (!plate || !nodeId) return res.status(400).json({ error: "plate and nodeId required" });

  const active = await VehicleSession.findOne({ plate, status: "ACTIVE" });
  if (!active) {
    await VehicleSession.create({ plate, entry_node: nodeId, entry_time: new Date(ts) });
  }

  // Calculate average speed between camera sightings
  const last = await store.getLastSighting(plate);
  if (last && last.nodeId !== nodeId) {
    const km = Math.abs(config.NODES[nodeId] - config.NODES[last.nodeId]);
    const hours = (ts - last.ts) / 3_600_000;
    if (km > 0 && hours > 0) {
      const avg = Math.round(km / hours);
      if (avg > config.SPEED_LIMIT) {
        await createViolation({ plate, type: "AVG_SPEED", speed_kmh: avg, nodeId });
      }
    }
  }
  await store.setLastSighting(plate, { nodeId, ts });
  res.json({ ok: true });
});

// ------------------------------------------------------------ Exit Gate
app.post("/api/gate/check-plate", async (req, res) => {
  const plate = cleanPlate(req.body.plate);
  if (!plate) return res.status(400).json({ error: "Plate is required" });

  const unpaid = await Violation.find({ plate, status: "UNPAID" }).select("-evidence");
  const unpaid_total = unpaid.reduce((sum, v) => sum + v.fine_amount, 0);
  const status = unpaid.length > 0 ? "LOCKED" : "OPEN";

  io.emit("gate:scan", { plate, status, unpaid_total, violations: unpaid.length });

  if (status === "LOCKED") {
    io.emit("officer:alert", {
      plate,
      message: `Gate locked for ${plate} - LKR ${unpaid_total} unpaid`,
      time: new Date(),
    });
  } else {
    await VehicleSession.updateMany(
      { plate, status: "ACTIVE" },
      { status: "EXITED", exit_time: new Date() }
    );
  }
  res.json({ plate, status, unpaid_total, violations: unpaid.length });
});

// ------------------------------------------------------------ Kiosk & Payments
app.get("/api/kiosk/bill/:plate", async (req, res) => {
  res.json(await buildBill(cleanPlate(req.params.plate)));
});

// PayHere Checkout Initialization
app.post("/api/kiosk/payhere/init", async (req, res) => {
  const plate = cleanPlate(req.body.plate);
  if (!plate) return res.status(400).json({ error: "Plate is required" });

  const bill = await buildBill(plate);
  if (bill.total <= 0) {
    return res.status(400).json({ error: "No toll or fines pending for this vehicle" });
  }

  const orderId = `HW-${plate.replace(/[^A-Z0-9]/g, "")}-${Date.now()}`;

  // Create pending Payment record in database
  await Payment.create({
    order_id: orderId,
    plate,
    amount: bill.total,
    currency: "LKR",
    method: "PAYHERE_CARD",
    status: "PENDING",
  });

  const checkoutData = payhere.buildCheckoutFields({
    orderId,
    amount: bill.total,
    plate,
  });

  res.json({
    action_url: checkoutData.action_url,
    fields: checkoutData.fields,
    bill,
  });
});

// PayHere Webhook Notification (POST form-urlencoded)
app.post("/api/payhere/notify", async (req, res) => {
  console.log("📥 PayHere Notification received:", req.body);

  // 1. Verify notification signature
  const isValidSig = payhere.verifyNotification(req.body);
  if (!isValidSig) {
    console.warn("❌ PayHere notification signature verification failed");
    return res.status(400).send("Invalid signature");
  }

  const { order_id, payhere_amount, status_code, payment_id, status_message } = req.body;

  // 2. Locate the payment in database
  const paymentRecord = await Payment.findOne({ order_id });
  if (!paymentRecord) {
    console.warn(`❌ PayHere payment record not found for order_id: ${order_id}`);
    return res.status(404).send("Payment order not found");
  }

  // 3. Idempotency: Ignore duplicate success callbacks
  if (paymentRecord.status === "SUCCESS") {
    console.log(`ℹ️ Payment ${order_id} already successfully settled. Ignoring duplicate.`);
    return res.status(200).send("Already processed");
  }

  // 4. Verify amount matches database
  if (Number(payhere_amount) !== Number(paymentRecord.amount)) {
    console.error(`❌ PayHere amount mismatch: received ${payhere_amount}, expected ${paymentRecord.amount}`);
    paymentRecord.status = "FAILED";
    await paymentRecord.save();

    io.emit("payment:failed", {
      plate: paymentRecord.plate,
      method: "PAYHERE_CARD",
      reason: `Amount mismatch: expected LKR ${paymentRecord.amount}, got LKR ${payhere_amount}`,
      time: new Date(),
    });

    mailer.sendPaymentFailureEmail({
      plate: paymentRecord.plate,
      amount: payhere_amount,
      method: "PAYHERE_CARD",
      reason: "Amount mismatch detected",
    });

    return res.status(400).send("Amount mismatch");
  }

  // 5. Handle Status Codes
  // status_code 2: Success
  if (Number(status_code) === 2) {
    console.log(`✅ PayHere payment successful for order ${order_id} (Ref: ${payment_id})`);
    await settlePayment({
      orderId: order_id,
      plate: paymentRecord.plate,
      amount: paymentRecord.amount,
      method: "PAYHERE_CARD",
      reference: payment_id || `PAYHERE-${Date.now()}`,
    });
    return res.status(200).send("OK");
  }

  // Other status codes: 0 (Pending), -1 (Canceled), -2 (Failed), -3 (Chargedback)
  const failureStatus = Number(status_code) === -1 ? "CANCELLED" : "FAILED";
  paymentRecord.status = failureStatus;
  await paymentRecord.save();

  const failureReason = status_message || `PayHere returned status code: ${status_code}`;
  console.warn(`⚠️ PayHere payment ${failureStatus} for order ${order_id}: ${failureReason}`);

  io.emit("payment:failed", {
    plate: paymentRecord.plate,
    method: "PAYHERE_CARD",
    reason: failureReason,
    time: new Date(),
  });

  mailer.sendPaymentFailureEmail({
    plate: paymentRecord.plate,
    amount: paymentRecord.amount,
    method: "PAYHERE_CARD",
    reason: failureReason,
  });

  return res.status(200).send("Handled failure");
});

// Direct Kiosk Payment (Cash or Mock Card)
app.post("/api/kiosk/pay", async (req, res) => {
  const plate = cleanPlate(req.body.plate);
  const method = String(req.body.method || "CASH").toUpperCase();
  const cardNumber = req.body.cardNumber;
  const bill = await buildBill(plate);

  const result = await payment.charge({ plate, amount: bill.total, method, cardNumber });

  if (!result.success) {
    io.emit("payment:failed", {
      plate,
      method,
      reason: result.error,
      time: new Date(),
    });

    mailer.sendPaymentFailureEmail({
      plate,
      amount: bill.total,
      method,
      reason: result.error,
    });

    return res.status(402).json({ error: result.error });
  }

  const orderId = `MOCK-${plate.replace(/[^A-Z0-9]/g, "")}-${Date.now()}`;
  await settlePayment({
    orderId,
    plate,
    amount: bill.total,
    method,
    reference: result.reference,
  });

  res.json({ status: "OPEN", reference: result.reference, paid: bill.total });
});

// ------------------------------------------------------------ Dashboard Data & Payments
app.get("/api/violations", async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const list = await Violation.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json(list);
});

// Delete a PAID violation manually (admin/officer cleanup)
app.delete("/api/violations/:id", async (req, res) => {
  try {
    const v = await Violation.findById(req.params.id);
    if (!v) return res.status(404).json({ error: "Violation not found" });
    if (v.status !== "PAID") return res.status(400).json({ error: "Only PAID violations can be deleted" });
    await Violation.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/payments", async (req, res) => {
  const list = await Payment.find().sort({ createdAt: -1 }).limit(20);
  res.json(list);
});

app.get("/api/stats", async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [today, unpaid, paid] = await Promise.all([
    Violation.countDocuments({ createdAt: { $gte: startOfDay } }),
    Violation.countDocuments({ status: "UNPAID" }),
    Violation.find({ status: "PAID" }).select("fine_amount"),
  ]);
  const revenue = paid.reduce((sum, v) => sum + v.fine_amount, 0);
  res.json({ today, unpaid, revenue });
});

// ------------------------------------------------------------ Video Upload & Vision Engine
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  fileFilter: (req, file, cb) =>
    cb(null, /^video\//.test(file.mimetype) || /\.(mp4|mov|avi|mkv|webm)$/i.test(file.originalname)),
});

let engineState = { state: "idle" };
function setEngineState(state) {
  engineState = state;
  io.emit("engine:status", state);
}

app.post("/api/engine/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please choose a video file (mp4, mov, avi, mkv, webm)" });
  }
  const file = req.file.originalname;
  const demo = req.body.demo !== "false";
  const distanceM = Number(req.body.distanceM) || 20;

  setEngineState({ state: "running", file });
  engine.start({
    videoPath: req.file.path,
    demo,
    distanceM,
    nodeId: "NODE-01",
    port: process.env.PORT || 4000,
    apiKey: process.env.API_KEY || "highway-secret-key",
    onLog: (text) => io.emit("engine:log", text),
    onExit: (code) => {
      fs.unlink(req.file.path, () => {});
      setEngineState({ state: code === "stopped" ? "stopped" : code === 0 ? "finished" : "error", file, code });
    },
  });
  res.json({ ok: true, file });
});

app.post("/api/engine/stop", (req, res) => {
  engine.stop();
  res.json({ ok: true });
});

app.get("/api/engine/status", (req, res) => res.json(engineState));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: err.message });
});

// ------------------------------------------------------------ WebSockets
io.on("connection", (socket) => {
  // Python engine sends annotated frames -> forward to every dashboard
  socket.on("frame", (data) => socket.broadcast.emit("camera:frame", data));
});

// Seed default users if empty
async function seedDefaultUsers() {
  const count = await User.countDocuments();
  if (count === 0) {
    const adminHash = await bcrypt.hash("admin123", 10);
    const officerHash = await bcrypt.hash("officer123", 10);
    await User.create([
      { username: "admin", password: adminHash, name: "Highway Control Admin", role: "ADMIN" },
      { username: "officer", password: officerHash, name: "Galle Interchange Officer", role: "OFFICER" },
    ]);
    console.log("👤 Default users seeded (admin / officer)");
  }
}

// ------------------------------------------------------------ Start Server
const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/highway_ai")
  .then(async () => {
    console.log("✅ MongoDB connected");
    await seedDefaultUsers();
    server.listen(PORT, () => console.log(`🚀 HighWay AI backend on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
