"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bill, getJSON, getSocket, postJSON, PublicConfig } from "@/lib/api";

type GateStatus = "IDLE" | "LOCKED" | "OPEN";

// Payment flow state within the card modal
type PayStep = "form" | "processing" | "success";

interface PayHereInitResponse {
  action_url: string;
  fields: Record<string, string>;
  bill: Bill;
}

// ── Credit card input form ────────────────────────────────────────────────────
function CardForm({
  onPay,
  onCancel,
  total,
}: {
  onPay: (card: { number: string; expiry: string; cvv: string; name: string }) => void;
  onCancel: () => void;
  total: number;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");

  // Format card number as groups of 4
  function formatCard(val: string) {
    return val
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  // Format expiry as MM/YY
  function formatExpiry(val: string) {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onPay({ number: cardNumber.replace(/\s/g, ""), expiry, cvv, name });
  }

  const valid =
    cardNumber.replace(/\s/g, "").length === 16 &&
    expiry.length === 5 &&
    cvv.length >= 3 &&
    name.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Card preview strip */}
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white shadow-inner">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest opacity-70">CREDIT CARD</span>
            {/* Visa logo */}
            <span className="font-black italic text-white text-xl tracking-tight">VISA</span>
          </div>
          {/* Chip */}
          <div className="my-3 h-7 w-10 rounded-md bg-yellow-300/80" />
          <p className="font-mono text-base tracking-widest">
            {cardNumber || "•••• •••• •••• ••••"}
          </p>
          <div className="mt-2 flex items-end justify-between text-xs">
            <div>
              <p className="opacity-60 uppercase">Card Holder</p>
              <p className="font-semibold uppercase">{name || "YOUR NAME"}</p>
            </div>
            <div className="text-right">
              <p className="opacity-60 uppercase">Expires</p>
              <p className="font-semibold">{expiry || "MM/YY"}</p>
            </div>
          </div>
        </div>

        <h3 className="mb-4 text-base font-black text-slate-900">
          Card Payment — LKR {total.toLocaleString()}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Cardholder name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cardholder Name</label>
            <input
              type="text"
              placeholder="John Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              required
            />
          </div>

          {/* Card number */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Card Number</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="1234 5678 9012 3456"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCard(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-sm tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
              maxLength={19}
              required
            />
          </div>

          {/* Expiry + CVV */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
                maxLength={5}
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CVV</label>
              <input
                type="password"
                inputMode="numeric"
                placeholder="•••"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
                maxLength={4}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              Pay Now
            </button>
          </div>
        </form>

        <p className="mt-3 text-center text-xs text-slate-400">🔒 Secured · 256-bit SSL Encrypted</p>
      </div>
    </motion.div>
  );
}

// ── Payment Success overlay ───────────────────────────────────────────────────
function PaymentSuccessOverlay({ onClose }: { onClose: () => void }) {
  // Auto-close after showing for a moment
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-900/40 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
          className="flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500 shadow-2xl"
        >
          <span className="text-5xl">✓</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <p className="text-3xl font-black text-white">Payment Successful!</p>
          <p className="mt-1 text-sm font-medium text-emerald-200">Opening gate barrier…</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExitGateStation() {
  const [plate, setPlate] = useState("");
  const [bill, setBill] = useState<Bill | null>(null);
  const [gate, setGate] = useState<GateStatus>("IDLE");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<PublicConfig>({
    provider: "mock",
    speedLimit: 100,
    exitNode: "NODE-08",
    tollPerKm: 25,
  });
  const [payStep, setPayStep] = useState<PayStep>("form"); // card modal state
  const [showCardForm, setShowCardForm] = useState(false);  // open/close card modal
  const [showSuccess, setShowSuccess] = useState(false);    // payment success overlay

  // Load public backend config
  useEffect(() => {
    getJSON<PublicConfig>("/api/config/public")
      .then(setConfig)
      .catch(() => {});
  }, []);

  const loadBill = useCallback(async (p: string) => {
    try {
      const b = await getJSON<Bill>(`/api/kiosk/bill/${encodeURIComponent(p)}`);
      setBill(b);
    } catch {
      setError("Could not load bill for vehicle");
    }
  }, []);

  // Socket listeners: gate:scan, payment:success, payment:failed
  useEffect(() => {
    const socket = getSocket();

    const onScan = (d: { plate: string; status: GateStatus }) => {
      setPlate(d.plate);
      setGate(d.status);
      setError("");
      loadBill(d.plate);
    };

    const onSuccess = (d: { plate: string; reference: string }) => {
      if (
        bill &&
        (bill.plate === d.plate ||
          bill.plate.replace(/[^A-Z0-9]/g, "") === d.plate.replace(/[^A-Z0-9]/g, ""))
      ) {
        // Show "Payment Successful" first, then unlock gate
        setShowSuccess(true);
        setPaying(false);
        setShowCardForm(false);
        setTimeout(() => {
          setGate("OPEN");
          setShowSuccess(false);
          loadBill(d.plate);
        }, 3200);
      }
    };

    const onFailed = (d: { plate: string; reason: string }) => {
      setPaying(false);
      setShowCardForm(false);
      setError(`Payment Failed: ${d.reason}`);
    };

    socket.on("gate:scan", onScan);
    socket.on("payment:success", onSuccess);
    socket.on("payment:failed", onFailed);

    return () => {
      socket.off("gate:scan", onScan);
      socket.off("payment:success", onSuccess);
      socket.off("payment:failed", onFailed);
    };
  }, [loadBill, bill]);

  // Manual plate scan
  async function scan() {
    if (!plate.trim()) return;
    setError("");
    try {
      await postJSON("/api/gate/check-plate", { plate });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Called when user submits card form
  async function handleCardPay(card: { number: string; expiry: string; cvv: string; name: string }) {
    if (!bill) return;
    setPaying(true);
    setPayStep("processing");

    if (config.provider === "payhere") {
      try {
        const initData = await postJSON<PayHereInitResponse>("/api/kiosk/payhere/init", {
          plate: bill.plate,
        });
        const form = document.createElement("form");
        form.method = "POST";
        form.action = initData.action_url;
        form.target = "_blank";
        Object.entries(initData.fields).forEach(([key, val]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          input.value = val;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        setShowCardForm(false);
        setPaying(false);
      } catch (e) {
        setError((e as Error).message);
        setPaying(false);
        setShowCardForm(false);
      }
    } else {
      // Mock: send card number to backend
      try {
        await postJSON("/api/kiosk/pay", {
          plate: bill.plate,
          method: "CARD",
          cardNumber: card.number,
        });
        // Payment success overlay shown via socket event
      } catch (e) {
        setError((e as Error).message);
        setPaying(false);
        setShowCardForm(false);
      }
    }
  }

  // Pay by Cash
  async function payCash() {
    if (!bill) return;
    setPaying(true);
    setError("");
    try {
      await postJSON("/api/kiosk/pay", { plate: bill.plate, method: "CASH" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  }

  const hasFines = !!bill && bill.fines.length > 0;

  return (
    <>
      {/* Card payment modal */}
      <AnimatePresence>
        {showCardForm && (
          <CardForm
            total={bill?.total ?? 0}
            onCancel={() => setShowCardForm(false)}
            onPay={handleCardPay}
          />
        )}
      </AnimatePresence>

      {/* Payment success overlay */}
      <AnimatePresence>
        {showSuccess && <PaymentSuccessOverlay onClose={() => setShowSuccess(false)} />}
      </AnimatePresence>

      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {/* Left: Plate scanner & gate status */}
        <section className="glass flex flex-col gap-5 p-6 border border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Exit Gate Station</h2>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              Pinnaduwa (Galle E01)
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Scanned Vehicle Number Plate
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && scan()}
                placeholder="e.g. WP CAB-1234"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-xl tracking-widest text-slate-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200 transition"
              />
              <button
                onClick={scan}
                className="rounded-2xl bg-emerald-600 px-6 font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                Scan
              </button>
            </div>
          </div>

          {/* Gate barrier visual */}
          <motion.div
            key={gate}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`rounded-3xl border-2 px-6 py-8 text-center transition ${
              gate === "LOCKED"
                ? "border-red-400 bg-red-50 text-red-700"
                : gate === "OPEN"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            <p className="text-5xl">{gate === "OPEN" ? "🔓" : gate === "LOCKED" ? "🔒" : "🚧"}</p>
            <p className="mt-3 text-2xl font-black tracking-widest">
              {gate === "IDLE" ? "WAITING FOR VEHICLE" : `BARRIER ${gate}`}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {gate === "LOCKED"
                ? "Unpaid traffic violations detected. Barrier locked."
                : gate === "OPEN"
                ? "Payment verified. Clearance granted. Safe travels!"
                : "Vehicle approaches exit lane sensor"}
            </p>
          </motion.div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              ⚠️ {error}
            </div>
          )}
        </section>

        {/* Right: Bill & payment */}
        <section className="glass flex flex-col gap-4 p-6 border border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Billing &amp; Toll Clearance</h2>
            <span className="text-xs font-semibold text-slate-500">
              Gateway: <strong className="uppercase text-slate-700">{config.provider}</strong>
            </span>
          </div>

          {!bill ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
              <span className="text-4xl">🎫</span>
              <p className="mt-2 text-sm">Scan an entry plate or choose a vehicle to view toll breakdown</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-medium text-slate-500">Vehicle:</span>
                <p className="font-mono text-lg font-bold text-slate-900">{bill.plate}</p>
              </div>

              <ul className="space-y-2 text-sm">
                <Row label="Highway Toll (Southern Expressway E01)" value={bill.toll} />
                {bill.fines.map((f) => (
                  <Row
                    key={f._id}
                    label={`Fine - ${
                      f.type === "SEATBELT"
                        ? "No Seatbelt"
                        : `Speeding${f.speed_kmh ? ` (${f.speed_kmh} km/h)` : ""}`
                    } [${f.nodeId || "Node"}]`}
                    value={f.fine_amount}
                    red
                  />
                ))}
                {!hasFines && (
                  <li className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 border border-emerald-100">
                    <span>✓</span> No pending traffic violations on record
                  </li>
                )}
              </ul>

              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-base font-semibold text-slate-600">Total Payable</span>
                <span className="text-3xl font-black text-slate-900">
                  LKR {bill.total.toLocaleString()}
                </span>
              </div>

              {/* Payment buttons */}
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  disabled={paying || gate === "OPEN"}
                  onClick={() => {
                    if (config.provider === "payhere") {
                      handleCardPay({ number: "", expiry: "", cvv: "", name: "" });
                    } else {
                      setShowCardForm(true);
                    }
                  }}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  <span>💳</span>
                  <span>
                    {paying
                      ? "Processing…"
                      : config.provider === "payhere"
                      ? "Pay via PayHere"
                      : "Pay by Card"}
                  </span>
                </button>
                <button
                  disabled={paying || gate === "OPEN"}
                  onClick={payCash}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white py-3.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  <span>💵</span>
                  <span>Cash &amp; Unlock</span>
                </button>
              </div>

              <p className="text-center text-xs text-slate-400">
                {config.provider === "payhere"
                  ? "🔒 PayHere Sandbox payment · Opens secure Sri Lankan checkout"
                  : "⚡ Mock Gateway Mode · Receipt & unlock trigger immediately"}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Row({ label, value, red = false }: { label: string; value: number; red?: boolean }) {
  return (
    <li
      className={`flex justify-between rounded-xl px-4 py-2.5 font-medium ${
        red ? "bg-red-50 text-red-700 border border-red-100" : "bg-slate-50 text-slate-700 border border-slate-100"
      }`}
    >
      <span>{label}</span>
      <span className="font-bold">LKR {value.toLocaleString()}</span>
    </li>
  );
}
