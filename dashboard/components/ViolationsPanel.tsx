"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deleteJSON, getJSON, getSocket, Violation } from "@/lib/api";

interface Stats {
  today: number;
  unpaid: number;
  revenue: number;
}

interface Alert {
  plate: string;
  message: string;
  type?: "officer" | "payment_failed";
}

const LABEL: Record<Violation["type"], string> = {
  SPEED: "Speeding",
  SEATBELT: "No Seatbelt",
  AVG_SPEED: "Avg Speeding",
};

export default function ViolationsPanel({ full = false }: { full?: boolean }) {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [stats, setStats] = useState<Stats>({ today: 0, unpaid: 0, revenue: 0 });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null); // tracks which id is being deleted

  const load = useCallback(async () => {
    try {
      setViolations(await getJSON<Violation[]>("/api/violations"));
      setStats(await getJSON<Stats>("/api/stats"));
    } catch {
      // Backend offline
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();

    // New violation from camera node
    const onNew = (v: Violation) => {
      setViolations((old) => [v, ...old].slice(0, 50));
      setStats((s) => ({ ...s, today: s.today + 1, unpaid: s.unpaid + 1 }));
    };

    // Officer alert for locked gate
    const onAlert = (a: { plate: string; message: string }) => {
      setAlerts((old) => [{ plate: a.plate, message: a.message, type: "officer" }, ...old].slice(0, 5));
    };

    // Payment failed alert
    const onPaymentFailed = (d: { plate: string; method?: string; reason?: string; error?: string }) => {
      const msg = `Payment Failed for ${d.plate} via ${d.method || "CARD"}: ${d.reason || d.error || "Declined"}`;
      setAlerts((old) => [{ plate: d.plate, message: msg, type: "payment_failed" }, ...old].slice(0, 5));
    };

    socket.on("violation:new", onNew);
    socket.on("officer:alert", onAlert);
    socket.on("payment:failed", onPaymentFailed);
    socket.on("payment:success", load);

    return () => {
      socket.off("violation:new", onNew);
      socket.off("officer:alert", onAlert);
      socket.off("payment:failed", onPaymentFailed);
      socket.off("payment:success", load);
    };
  }, [load]);

  // Delete a PAID violation
  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteJSON(`/api/violations/${id}`);
      setViolations((prev) => prev.filter((v) => v._id !== id));
      // Refresh stats too
      setStats(await getJSON<Stats>("/api/stats"));
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today's Violations" value={stats.today} accent="text-slate-800" bg="bg-white" />
        <Stat label="Unpaid Fines" value={stats.unpaid} accent="text-red-600" bg="bg-red-50/60 border-red-100" />
        <Stat label="Revenue (LKR)" value={stats.revenue.toLocaleString()} accent="text-emerald-700" bg="bg-emerald-50/60 border-emerald-100" />
      </div>

      {/* Real-time Alerts */}
      <AnimatePresence>
        {alerts.map((a, i) => (
          <motion.div
            key={a.message + i}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm ${
              a.type === "payment_failed"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {a.type === "payment_failed" ? "💳 Payment Failure Alert: " : "👮 Officer Alert: "}
            {a.message}
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="glass p-5 border border-slate-200 bg-white">
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-slate-900">Enforcement Log</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Southern Expressway E01
          </span>
        </div>

        <ul className={`space-y-2.5 overflow-y-auto pr-1 ${full ? "max-h-[75vh]" : "max-h-[440px]"}`}>
          <AnimatePresence initial={false}>
            {violations.map((v) => (
              <motion.li
                key={v._id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 hover:bg-slate-100/60 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-white">
                      {v.plate}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        v.type === "SPEED" || v.type === "AVG_SPEED"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {LABEL[v.type]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {v.speed_kmh ? `${v.speed_kmh} km/h · ` : ""}
                    Node: {v.nodeId || "E01-01"} · {new Date(v.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      LKR {v.fine_amount.toLocaleString()}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                        v.status === "PAID"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  {/* Delete button — only visible for PAID violations */}
                  {v.status === "PAID" && (
                    <button
                      onClick={() => handleDelete(v._id)}
                      disabled={deleting === v._id}
                      title="Delete paid record"
                      className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-40 transition"
                    >
                      {deleting === v._id ? (
                        <span className="text-xs animate-spin">⟳</span>
                      ) : (
                        <span className="text-xs font-black">✕</span>
                      )}
                    </button>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>

          {violations.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              <span className="text-3xl">🛣️</span>
              <p className="mt-2 text-sm font-medium">No violations logged yet. All traffic compliant!</p>
            </div>
          )}
        </ul>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent = "text-slate-900",
  bg = "bg-white",
}: {
  label: string;
  value: number | string;
  accent?: string;
  bg?: string;
}) {
  return (
    <div className={`glass border border-slate-200 px-4 py-3.5 shadow-sm ${bg}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
    </div>
  );
}
