import { io, Socket } from "socket.io-client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ---- Types
export interface Violation {
  _id: string;
  plate: string;
  type: "SPEED" | "SEATBELT" | "AVG_SPEED";
  speed_kmh?: number;
  nodeId?: string;
  fine_amount: number;
  status: "UNPAID" | "PAID";
  payment_ref?: string;
  createdAt: string;
}

export interface Bill {
  plate: string;
  toll: number;
  fines: Violation[];
  fines_total: number;
  total: number;
}

export interface PublicConfig {
  provider: "mock" | "payhere";
  speedLimit: number;
  exitNode: string;
  tollPerKm: number;
}

export interface UserSession {
  username: string;
  name: string;
  role: "ADMIN" | "OFFICER";
}

// ---- REST helpers
export async function getJSON<T>(path: string): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("hw_auth_token") : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("hw_auth_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function deleteJSON<T = { success: boolean }>(path: string): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("hw_auth_token") : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---- Shared Socket instance
let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) socket = io(API_URL);
  return socket;
}
