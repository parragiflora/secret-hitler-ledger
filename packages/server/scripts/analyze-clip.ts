// Dev tool: run a local video file through the real (or mock) Interhuman
// pipeline directly, bypassing the full lobby/game/capture-UI flow. Useful
// for verifying real recorded content without needing 5 players and a live
// capture moment.
//
// Usage:
//   npm run analyze-clip --workspace=@interhuman/server -- /path/to/clip.mov
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeClip } from "../src/interhuman.js";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"));
} catch {
  console.warn("No packages/server/.env found -- running in mock mode (no INTERHUMAN_API_KEY).\n");
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npm run analyze-clip --workspace=@interhuman/server -- <path-to-video-file>");
  process.exit(1);
}

const resolved = path.resolve(filePath);
const buffer = await readFile(resolved);
console.log(`Analyzing ${resolved} (${(buffer.length / 1024).toFixed(0)} KB)...`);

const result = await analyzeClip(buffer, path.basename(resolved));

console.log(`\nMode: ${result.mocked ? "MOCK (no real analysis was performed)" : "REAL API"}`);
console.log(`  confidence:  ${result.confidence}`);
console.log(`  stress:      ${result.stress}`);
console.log(`  skepticism:  ${result.skepticism}`);
console.log(`  hesitation:  ${result.hesitation}`);

if (!result.mocked) {
  console.log("\nRaw Interhuman response:");
  console.log(JSON.stringify(result.rawResponseJson, null, 2));
}
