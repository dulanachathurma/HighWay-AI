"use client";

import { motion } from "framer-motion";
import { UserSession } from "@/lib/api";

export type Tab = "command" | "map" | "violations" | "gate";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "command", label: "Command Center", icon: "📹" },
  { id: "map", label: "E01 Highway Map", icon: "🗺️" },
  { id: "violations", label: "Violations", icon: "🚨" },
  { id: "gate", label: "Exit Gate Kiosk", icon: "🚧" },
];

interface FloatingNavProps {
  active: Tab;
  onChange: (t: Tab) => void;
  user: UserSession | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export default function FloatingNav({ active, onChange, user, onOpenAuth, onLogout }: FloatingNavProps) {
  return (
    /* Outer wrapper: full-width, fixed, pointer-events-none so only the pill captures clicks */
    <div className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        /* Re-enable clicks on the pill itself */
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-md"
        style={{ maxWidth: "100%" }}
      >
        {/* Brand logo */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 shrink-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-700 font-mono text-xs font-black text-white">
            E01
          </span>
          <span className="hidden sm:block text-sm font-black tracking-tight text-slate-900 whitespace-nowrap">
            HighWay AI
          </span>
        </div>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-slate-200 shrink-0" />

        {/* Tab buttons */}
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                active === tab.id ? "text-slate-950" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {active === tab.id && (
                <motion.span
                  layoutId="active-pill"
                  className="absolute inset-0 rounded-full bg-slate-100 shadow-inner"
                  transition={{ type: "spring", stiffness: 450, damping: 35 }}
                />
              )}
              {/* Always show icon; show label on md+ */}
              <span className="relative">{tab.icon}</span>
              <span className="relative hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-slate-200 shrink-0" />

        {/* Auth section */}
        <div className="flex items-center gap-2 shrink-0 pr-1">
          {user ? (
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  user.role === "ADMIN" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {user.role}
              </span>
              <button
                onClick={onLogout}
                title="Sign out"
                className="text-xs font-medium text-slate-400 hover:text-red-500 transition"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </motion.nav>
    </div>
  );
}
