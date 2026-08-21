import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const script = process.argv[2];
if (!script) throw new Error("usage: node scripts/run-python.mjs <python arguments>");
const bundled = "C:\\Users\\USER\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
const localPython = "C:\\Users\\USER\\AppData\\Local\\Python\\bin\\python.exe";
const candidates = [process.env.PYTHON, "python3", "python", "py", process.platform === "win32" && existsSync(localPython) ? localPython : undefined, process.platform === "win32" && existsSync(bundled) ? bundled : undefined].filter(Boolean);
for (const executable of candidates) {
  const args = process.argv.slice(2);
  const prefix = process.platform === "win32" && executable === "py" ? ["-3"] : [];
  const probe = spawnSync(executable, [...prefix, "-c", "import sys"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) continue;
  const result = spawnSync(executable, [...prefix, ...args], { stdio: "inherit" });
  if (!result.error) process.exit(result.status ?? 1);
}
console.error("FAIL: no working Python 3 interpreter found. Set PYTHON to its executable path.");
process.exit(1);
