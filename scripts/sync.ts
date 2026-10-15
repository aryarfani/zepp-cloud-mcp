// On-demand sync: `npm run sync` (optionally `npm run sync -- --days 30`). Uses the same .env and data/zepp.db as the server.
import "dotenv/config";
import path from "node:path";
import { parseConfig } from "../src/config";
import { createServices } from "../src/services";
import { ZeppStore } from "../src/store/store";
import { parseSyncConfig } from "../src/sync/config";
import { runSync } from "../src/sync/sync";

function parseDays(argv: string[]): number | undefined {
  const i = argv.indexOf("--days");
  if (i === -1) return undefined;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 730) throw new Error("--days must be an integer from 1 to 730");
  return value;
}

const syncConfig = parseSyncConfig(process.env);
const days = parseDays(process.argv.slice(2));
const config = parseConfig({
  MCP_SECRET: process.env.MCP_SECRET || "",
  ZEPP_APP_TOKEN: process.env.ZEPP_APP_TOKEN || "",
  ZEPP_USER_ID: process.env.ZEPP_USER_ID || "",
  ZEPP_REGION_HOST: process.env.ZEPP_REGION_HOST || "",
  USER_TIMEZONE: process.env.USER_TIMEZONE || "Asia/Jakarta"
});
const store = new ZeppStore(path.resolve(syncConfig.dbPath));
const result = await runSync(
  createServices(config),
  store,
  { backfillDays: syncConfig.backfillDays, recentDays: syncConfig.recentDays, requestDelayMs: syncConfig.requestDelayMs, log: m => console.log(m) },
  "manual",
  days === undefined ? {} : { days }
);
store.close();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);