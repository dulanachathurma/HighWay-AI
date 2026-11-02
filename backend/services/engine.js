// Starts / stops the python vision engine for an uploaded video.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const VISION_DIR = path.join(__dirname, "..", "..", "vision");
let child = null;

// use the venv python if the user created one in vision/venv, otherwise python3
function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venvPython = path.join(VISION_DIR, "venv", "bin", "python");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

function isRunning() {
  return child !== null;
}

function stop() {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
}

function start({ videoPath, demo, distanceM, nodeId, port, apiKey, onLog, onExit }) {
  stop(); // only one video at a time

  const args = [
    "-u", // unbuffered output so logs arrive instantly
    path.join(VISION_DIR, "vision_engine.py"),
    "--source", videoPath,
    "--node-id", nodeId,
    "--backend", `http://localhost:${port}`,
    "--api-key", apiKey,
    "--distance-m", String(distanceM),
  ];
  if (demo) args.push("--demo");

  const proc = spawn(pythonBin(), args, { cwd: VISION_DIR });
  child = proc;

  proc.stdout.on("data", (d) => onLog(d.toString()));
  proc.stderr.on("data", (d) => onLog(d.toString()));
  proc.on("error", (err) => {
    onLog(`Could not start python: ${err.message}`);
    if (child === proc) child = null;
    onExit(-1);
  });
  proc.on("close", (code) => {
    const wasStopped = child !== proc; // stop() was called
    if (child === proc) child = null;
    onExit(wasStopped ? "stopped" : code);
  });
}

module.exports = { start, stop, isRunning };
