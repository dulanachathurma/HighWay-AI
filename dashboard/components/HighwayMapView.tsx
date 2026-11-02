"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getJSON } from "@/lib/api";

interface NodeInfo {
  id: string;
  name: string;
  km: number;
  status: "ONLINE" | "STANDBY";
  interchange: boolean;
  coords: { x: number; y: number }; // percentage on SVG map
}

const E01_NODES: NodeInfo[] = [
  { id: "NODE-01", name: "Kottawa Interchange", km: 0.0, status: "ONLINE", interchange: true, coords: { x: 34, y: 15 } },
  { id: "NODE-02", name: "Kahathuduwa", km: 5.9, status: "ONLINE", interchange: true, coords: { x: 35, y: 24 } },
  { id: "NODE-03", name: "Gelanigama (Bandaragama)", km: 13.7, status: "ONLINE", interchange: true, coords: { x: 37, y: 33 } },
  { id: "NODE-04", name: "Dodangoda", km: 34.8, status: "ONLINE", interchange: true, coords: { x: 40, y: 44 } },
  { id: "NODE-05", name: "Welipenna Service Area", km: 46.0, status: "ONLINE", interchange: false, coords: { x: 42, y: 53 } },
  { id: "NODE-06", name: "Kurundugahahetekma", km: 67.6, status: "ONLINE", interchange: true, coords: { x: 44, y: 63 } },
  { id: "NODE-07", name: "Baddegama", km: 79.8, status: "ONLINE", interchange: true, coords: { x: 46, y: 72 } },
  { id: "NODE-08", name: "Pinnaduwa (Galle Exit)", km: 95.3, status: "ONLINE", interchange: true, coords: { x: 49, y: 81 } },
  { id: "NODE-09", name: "Godagama (Matara Exit)", km: 126.2, status: "ONLINE", interchange: true, coords: { x: 62, y: 88 } },
  { id: "NODE-10", name: "Hambantota Hub", km: 222.0, status: "STANDBY", interchange: true, coords: { x: 82, y: 85 } },
];

export default function HighwayMapView() {
  const [selectedNode, setSelectedNode] = useState<NodeInfo>(E01_NODES[0]);
  const [activeNodes, setActiveNodes] = useState<Record<string, number>>({});

  useEffect(() => {
    getJSON<{ nodes: Record<string, number> }>("/api/nodes")
      .then((data) => setActiveNodes(data.nodes || {}))
      .catch(() => {});
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Map visual panel */}
      <section className="glass col-span-2 p-6 border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white font-mono">E01</span>
              Southern Expressway Camera Network
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Western & Southern Province Surveillance Corridor · Sri Lanka Road Development Authority
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            10 Sensor Nodes Active
          </div>
        </div>

        {/* Stylized SVG Map of Sri Lanka Southern Expressway Route */}
        <div className="relative mt-6 h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-sky-50/50 via-slate-50 to-emerald-50/40 p-4">
          {/* Sri Lanka Coastline Silhouette Guide */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Coastal Water / Land Curve */}
            <path
              d="M 28 0 Q 30 40 40 75 Q 46 88 56 94 Q 75 96 95 85 L 100 100 L 0 100 L 0 0 Z"
              fill="#f8fafc"
              stroke="#e2e8f0"
              strokeWidth="0.7"
            />
            {/* Indian Ocean Label */}
            <text x="12" y="80" fill="#94a3b8" fontSize="3.5" fontWeight="bold" letterSpacing="0.8">
              INDIAN OCEAN
            </text>
            <text x="70" y="30" fill="#cbd5e1" fontSize="4" fontWeight="bold">
              SRI LANKA
            </text>

            {/* Expressway Path */}
            <path
              d="M 34 15 Q 36 28 37 33 Q 41 48 44 63 Q 47 76 49 81 Q 55 86 62 88 Q 72 87 82 85"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="2.5 1"
            />
          </svg>

          {/* Interactive Node Pins */}
          {E01_NODES.map((node) => {
            const isSelected = selectedNode.id === node.id;
            return (
              <motion.button
                key={node.id}
                onClick={() => setSelectedNode(node)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  left: `${node.coords.x}%`,
                  top: `${node.coords.y}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full p-1.5 shadow-md transition-colors ${
                  isSelected
                    ? "bg-emerald-600 text-white ring-4 ring-emerald-200 z-20"
                    : "bg-white text-slate-800 border-2 border-emerald-600 hover:bg-emerald-50 z-10"
                }`}
              >
                <span className="text-xs font-mono font-bold px-1">{node.id.replace("NODE-", "")}</span>
              </motion.button>
            );
          })}

          {/* Map legend */}
          <div className="absolute bottom-3 left-3 rounded-xl border border-slate-200 bg-white/90 p-3 text-xs shadow-sm backdrop-blur">
            <p className="font-bold text-slate-800 mb-1">Highway Map Legend</p>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
              <span>Camera Node (Speed & ANPR)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 mt-1">
              <span className="h-0.5 w-4 bg-emerald-600 border-b border-dashed" />
              <span>E01 Expressway Corridor</span>
            </div>
          </div>
        </div>
      </section>

      {/* Selected Node Details Card */}
      <section className="glass flex flex-col justify-between p-6 border border-slate-200 bg-white">
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="rounded-md bg-emerald-100 px-2.5 py-1 font-mono text-xs font-bold text-emerald-800">
              {selectedNode.id}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              ● {selectedNode.status}
            </span>
          </div>

          <h3 className="mt-4 text-xl font-black text-slate-900">{selectedNode.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Kilometer Post: KM {selectedNode.km.toFixed(1)} from Kottawa</p>

          <div className="mt-6 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-xs font-medium text-slate-500">Speed Enforcement Limit</span>
              <p className="text-lg font-black text-slate-900">100 km/h</p>
              <p className="text-xs text-slate-400 mt-0.5">Calibrated distance: 20m dual-line ANPR</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-xs font-medium text-slate-500">Node Capabilities</span>
              <ul className="mt-1 space-y-1 text-xs font-semibold text-slate-700">
                <li>✓ Instantaneous Speed Detection</li>
                <li>✓ EasyOCR Sri Lankan Number Plate Reading</li>
                <li>✓ AI Driver Seatbelt Enforcement (YOLO)</li>
                <li>✓ Point-to-Point Average Speed Calculation</li>
              </ul>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-xs font-medium text-slate-500">Interchange Toll Clearance</span>
              <p className="text-sm font-bold text-slate-800">
                {selectedNode.interchange ? "Exit Barrier Kiosk Integrated" : "En-route Sensor Waypoint"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-center text-xs text-slate-400">
            Road Development Authority · Intelligent Highway Division
          </p>
        </div>
      </section>
    </div>
  );
}
