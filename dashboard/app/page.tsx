"use client";

import { useEffect, useState } from "react";
import FloatingNav, { Tab } from "@/components/FloatingNav";
import LiveCameraFeed from "@/components/LiveCameraFeed";
import ViolationsPanel from "@/components/ViolationsPanel";
import ExitGateStation from "@/components/ExitGateStation";
import VideoUploader from "@/components/VideoUploader";
import HighwayMapView from "@/components/HighwayMapView";
import AuthModal from "@/components/AuthModal";
import { UserSession } from "@/lib/api";

export default function Home() {
  const [tab, setTab] = useState<Tab>("command");
  const [user, setUser] = useState<UserSession | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    // Restore saved user session if valid
    const saved = localStorage.getItem("hw_auth_user");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {}
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("hw_auth_token");
    localStorage.removeItem("hw_auth_user");
    setUser(null);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-200 via-amber-50/60 to-slate-300 px-4 pb-16 pt-24 md:px-10">
      {/* Highway yellow & slate ambient depth */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-amber-300/30 blur-[130px]" />
      <div className="pointer-events-none absolute -right-20 top-1/4 h-96 w-96 rounded-full bg-yellow-400/20 blur-[140px]" />
      <div className="pointer-events-none absolute left-1/3 bottom-10 h-80 w-80 rounded-full bg-slate-400/20 blur-[120px]" />

      <FloatingNav
        active={tab}
        onChange={setTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={setUser}
      />

      <div className="relative mx-auto max-w-7xl">
        {tab === "command" && (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="space-y-6 lg:col-span-3">
              <LiveCameraFeed />
              <VideoUploader />
            </div>
            <div className="lg:col-span-2">
              <ViolationsPanel />
            </div>
          </div>
        )}

        {tab === "map" && <HighwayMapView />}
        {tab === "violations" && <ViolationsPanel full />}
        {tab === "gate" && <ExitGateStation />}
      </div>
    </main>
  );
}
