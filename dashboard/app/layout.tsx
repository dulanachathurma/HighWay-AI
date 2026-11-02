import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HighWay AI - Southern Expressway (E01) Command Center",
  description: "Automated highway speed, seatbelt enforcement & toll clearance system for Sri Lanka",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased text-slate-900">{children}</body>
    </html>
  );
}
