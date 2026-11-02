// Southern Expressway (E01) Configuration & Business Rules
module.exports = {
  SPEED_LIMIT: 100, // km/h Sri Lanka expressway legal limit

  // Camera nodes along the Southern Expressway (E01) with their exact kilometer post
  NODES: {
    "NODE-01": 0.0,    // Kottawa Interchange
    "NODE-02": 5.9,    // Kahathuduwa
    "NODE-03": 13.7,   // Gelanigama (Bandaragama)
    "NODE-04": 34.8,   // Dodangoda
    "NODE-05": 46.0,   // Welipenna (Service Area)
    "NODE-06": 67.6,   // Kurundugahahetekma (Elpitiya)
    "NODE-07": 79.8,   // Baddegama
    "NODE-08": 95.3,   // Pinnaduwa (Galle Exit)
    "NODE-09": 126.2,  // Godagama (Matara Exit)
    "NODE-10": 222.0,  // Hambantota
  },

  NODE_NAMES: {
    "NODE-01": "Kottawa Interchange",
    "NODE-02": "Kahathuduwa",
    "NODE-03": "Gelanigama",
    "NODE-04": "Dodangoda",
    "NODE-05": "Welipenna Service Area",
    "NODE-06": "Kurundugahahetekma",
    "NODE-07": "Baddegama",
    "NODE-08": "Pinnaduwa (Galle)",
    "NODE-09": "Godagama (Matara)",
    "NODE-10": "Hambantota Hub",
  },

  EXIT_NODE: "NODE-08", // Default Galle exit station

  // Toll: LKR per km travelled (Sri Lanka RDA standards)
  TOLL_PER_KM: 25,
  TOLL_MIN: 150,

  FINE_SEATBELT: 2000, // LKR 2,000 for seatbelt violation

  // Speed fine tiers (Sri Lanka Motor Traffic Act):
  // Pick the first tier where speed > over
  SPEED_FINES: [
    { over: 140, amount: 20000 }, // Gross speeding (> 140 km/h)
    { over: 120, amount: 10000 }, // High speed (121 - 140 km/h)
    { over: 100, amount: 5000 },  // Speeding (101 - 120 km/h)
  ],

  DUPLICATE_WINDOW_MS: 5 * 60 * 1000, // Ignore same plate+type within 5 minutes
};
