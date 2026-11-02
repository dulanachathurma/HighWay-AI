"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL, getJSON, getSocket } from "@/lib/api";

type EngineState = "idle" | "uploading" | "running" | "finished" | "stopped" | "error";

export default function VideoUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [demo, setDemo] = useState(true);
  const [distance, setDistance] = useState("20");
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<EngineState>("idle");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getJSON<{ state: EngineState }>("/api/engine/status")
      .then((s) => setState(s.state))
      .catch(() => {});

    const socket = getSocket();
    const onStatus = (s: { state: EngineState }) => setState(s.state);
    const onLog = (text: string) => {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      setLogs((old) => [...old, ...lines].slice(-6));
    };

    socket.on("engine:status", onStatus);
    socket.on("engine:log", onLog);

    return () => {
      socket.off("engine:status", onStatus);
      socket.off("engine:log", onLog);
    };
  }, []);

  function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError("");
  }

  function upload() {
    if (!file) return;
    setError("");
    setLogs([]);
    setProgress(0);
    setState("uploading");

    const form = new FormData();
    form.append("demo", String(demo));
    form.append("distanceM", distance);
    form.append("video", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/engine/upload`);
    xhr.upload.onprogress = (e) =>
      e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setState("running");
      } else {
        setState("error");
        try {
          setError(JSON.parse(xhr.responseText).error);
        } catch {
          setError("Upload failed");
        }
      }
    };
    xhr.onerror = () => {
      setState("error");
      setError("Cannot reach backend (is server running on port 4000?)");
    };
    xhr.send(form);
  }

  async function stop() {
    await fetch(`${API_URL}/api/engine/stop`, { method: "POST" });
  }

  const busy = state === "uploading" || state === "running";

  return (
    <section className="glass space-y-4 p-5 border border-slate-200 bg-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Upload Highway Footage</h2>
        <StatusBadge state={state} />
      </div>

      {/* Drag & drop upload area */}
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pickFile(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
          dragging
            ? "border-emerald-500 bg-emerald-50/50"
            : "border-slate-200 bg-slate-50 hover:bg-slate-100/70"
        } ${busy ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <p className="text-4xl">🎬</p>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          {file ? file.name : "Drop expressway CCTV video here, or click to browse"}
        </p>
        {file ? (
          <p className="text-xs font-mono text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">Supports MP4, MOV, AVI, MKV (tested with highway videos)</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>

      {/* Detection parameters */}
      <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-700">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => setDemo(e.target.checked)}
            disabled={busy}
            className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
          />
          Sri Lanka Plates & Seatbelt Model Demo
        </label>
        <label className="flex items-center gap-2">
          Line Calibration (m):
          <input
            value={distance}
            onChange={(e) => setDistance(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={busy}
            className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center font-bold text-slate-900 outline-none focus:border-emerald-600"
          />
        </label>
      </div>

      {state === "uploading" && (
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={upload}
          disabled={!file || busy}
          className="flex-1 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-40 transition"
        >
          {state === "uploading"
            ? `Uploading ${progress}%`
            : state === "running"
            ? "Analyzing Traffic Feed..."
            : "Upload & Detect"}
        </button>
        {state === "running" && (
          <button
            onClick={stop}
            className="rounded-2xl border border-red-300 bg-red-50 px-6 font-bold text-red-600 hover:bg-red-100 transition"
          >
            Stop
          </button>
        )}
      </div>

      {/* Python Engine console log window */}
      {logs.length > 0 && (
        <pre className="max-h-28 overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-emerald-400">
          {logs.join("\n")}
        </pre>
      )}
    </section>
  );
}

function StatusBadge({ state }: { state: EngineState }) {
  const map: Record<EngineState, { text: string; cls: string }> = {
    idle: { text: "READY", cls: "bg-slate-100 text-slate-600" },
    uploading: { text: "UPLOADING", cls: "bg-amber-100 text-amber-800 animate-pulse" },
    running: { text: "DETECTING", cls: "bg-emerald-100 text-emerald-800 font-bold" },
    finished: { text: "FINISHED", cls: "bg-blue-100 text-blue-800" },
    stopped: { text: "STOPPED", cls: "bg-slate-100 text-slate-500" },
    error: { text: "ERROR", cls: "bg-red-100 text-red-700" },
  };
  const { text, cls } = map[state];
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{text}</span>;
}
