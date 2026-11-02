// Simulated Southern Expressway traffic for testing
// Run: npm run simulate
const API = process.env.API_URL || "http://localhost:4000";
const headers = {
  "Content-Type": "application/json",
  "x-api-key": process.env.API_KEY || "highway-secret-key",
};

const call = (path, body) =>
  fetch(API + path, { method: "POST", headers, body: JSON.stringify(body) }).then((r) => r.json());

async function main() {
  console.log("🚦 HighWay AI: Starting Southern Expressway E01 Traffic Simulation...");

  console.log("\n1) Speeding vehicle scanned at Kottawa (NODE-01): WP CAB-1234 (134 km/h)");
  await call("/api/violations", {
    plate: "WP CAB-1234",
    type: "SPEED",
    speed_kmh: 134,
    nodeId: "NODE-01",
  });

  console.log("2) Driver without seatbelt detected at Kahathuduwa (NODE-02): SP CAA-5588");
  await call("/api/violations", {
    plate: "SP CAA-5588",
    type: "SEATBELT",
    nodeId: "NODE-02",
  });

  console.log("3) Average speed violation: Kottawa -> Gelanigama (13.7 km) in 5 minutes = 164 km/h: WP BZ-9012");
  const now = Date.now();
  await call("/api/sightings", { plate: "WP BZ-9012", nodeId: "NODE-01", timestamp: now - 300000 });
  await call("/api/sightings", { plate: "WP BZ-9012", nodeId: "NODE-03", timestamp: now });

  console.log("4) Checking Exit Gate for WP CAB-1234 (Should be LOCKED with unpaid fines):");
  const lockedGate = await call("/api/gate/check-plate", { plate: "WP CAB-1234" });
  console.log(lockedGate);

  console.log("5) Checking Exit Gate for clean vehicle SP CAD-8899 (Should be OPEN):");
  const openGate = await call("/api/gate/check-plate", { plate: "SP CAD-8899" });
  console.log(openGate);

  console.log("\n✅ Simulation complete! Check the Command Center & Exit Gate on http://localhost:3000");
}

main().catch(console.error);
