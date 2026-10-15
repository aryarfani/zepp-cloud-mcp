// Re-derive stored strength_sets.exercise labels from action_type with the current name tables (owner table > catalog > unknown_<id>).
// Idempotent and local-only (no Zepp calls): `npm run exercises:rederive`. The server also does this once at startup.
import "dotenv/config";
import path from "node:path";
import { ZeppStore } from "../src/store/store";
import { parseSyncConfig } from "../src/sync/config";

const syncConfig = parseSyncConfig(process.env);
const store = new ZeppStore(path.resolve(syncConfig.dbPath));
const changed = store.rederiveExerciseNames();
store.close();
console.log(JSON.stringify({ updated_rows: changed }));
