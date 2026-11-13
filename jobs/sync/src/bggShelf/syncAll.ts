#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { sleep } from "./api.js";
import { runSync } from "./sync.js";
import { runHotnessSync } from "./hotness.js";

// Run sequentially to respect BGG request pacing, but attempt both even if one fails.
export async function runAll({ collection = runSync, hotness = runHotnessSync, delay = sleep } = {}) {
  let failed = false;
  try { console.log("BGG shelf:", await collection()); }
  catch (error) { failed = true; console.error(error instanceof Error ? error.message : String(error)); }
  await delay(Number(process.env.BGG_REQUEST_DELAY_MS ?? 5000));
  try { console.log("BGG hotness:", await hotness()); }
  catch (error) { failed = true; console.error(error instanceof Error ? error.message : String(error)); }
  if (failed) throw new Error("One or more BGG syncs failed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAll().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
