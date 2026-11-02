// "Last place we saw this plate" - lives in Redis (fast, auto-expires).
// If Redis is not running we silently use an in-memory Map so the demo still works.
const Redis = require("ioredis");

const memory = new Map();
let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on("error", () => {}); // do not crash when Redis is down
}

const key = (plate) => `sighting:${plate}`;
const ONE_DAY = 60 * 60 * 24;

async function setLastSighting(plate, data) {
  memory.set(plate, data);
  try {
    if (redis) await redis.set(key(plate), JSON.stringify(data), "EX", ONE_DAY);
  } catch (e) {}
}

async function getLastSighting(plate) {
  try {
    if (redis) {
      const raw = await redis.get(key(plate));
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {}
  return memory.get(plate) || null;
}

module.exports = { setLastSighting, getLastSighting };
