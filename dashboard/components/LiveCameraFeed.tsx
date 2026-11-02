"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/api";

interface Frame {
  nodeId: string;
  image: string;
}

export default function LiveCameraFeed() {
  const [frames, setFrames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const lastFrameAt = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    const onFrame = (f: Frame) => {
      lastFrameAt.current = Date.now();
      setLive(true);
      setFrames((old) => ({ ...old, [f.nodeId]: f.image }));
    };
    socket.on("camera:frame", onFrame);

    const timer = setInterval(() => {
      if (Date.now() - lastFrameAt.current > 3000) setLive(false);
    }, 1000);

    return () => {
      socket.off("camera:frame", onFrame);
      clearInterval(timer);
    };
  }, []);

  const nodes = Object.keys(frames);
  const current = selected && frames[selected] ? selected : nodes[0];

  return (
    <section className="glass p-5 border border-slate-200 bg-white">
      <header className="mb-3.5 flex items-center justify-between px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Live ANPR & Speed Camera</h2>
          <p className="text-xs text-slate-500">Southern Expressway (E01) Surveillance Feed</p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              live ? "bg-red-500 animate-pulse" : current ? "bg-amber-400" : "bg-slate-300"
            }`}
          />
          {live ? "LIVE" : current ? "ENDED" : "OFFLINE"}
        </span>
      </header>

      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 border border-slate-200 shadow-inner">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${frames[current]}`}
            alt={`Camera ${current}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
            <span className="text-4xl">📹</span>
            <p className="font-semibold text-slate-300">Waiting for live camera stream...</p>
            <p className="text-xs text-slate-500">
              Upload a highway video below or run the Python Edge Engine to stream live detections.
            </p>
          </div>
        )}
      </div>

      {/* Node selector buttons */}
      {nodes.length > 1 && (
        <div className="mt-3 flex gap-2 px-1">
          {nodes.map((n) => (
            <button
              key={n}
              onClick={() => setSelected(n)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                n === current
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
