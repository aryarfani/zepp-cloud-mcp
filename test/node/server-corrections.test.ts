import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { EMPTY_COUNTS, ZeppStore } from "../../src/store/store";
import { normalizeWorkoutSummary } from "../../src/zepp/workouts";

it("serves local MCP edits to the authenticated dashboard in the Node runtime", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zepp-server-"));
  const file = path.join(dir, "zepp.db");
  const store = new ZeppStore(file);
  const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
  store.upsertWorkout(workout, "2023-11-14", {}, new Date().toISOString());
  store.replaceStrengthSets(workout.workout_id, [{ set: 0, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 }], ["source"]);
  store.markStrengthDetailRefreshed(workout.workout_id, new Date().toISOString());
  const run = store.startRun("manual", "2023-11-14", "2023-11-14", new Date().toISOString());
  store.finishRun(run, { ok: true, status: "ok", counts: EMPTY_COUNTS }, new Date().toISOString());
  store.close();
  const reservation = net.createServer();
  await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const password = "fixture-owner-password-123";
  const child = spawn(process.execPath, ["--import", "tsx", "src/server-node.ts"], {
    cwd: process.cwd(), windowsHide: true, stdio: "ignore",
    env: { ...process.env, PORT: String(port), SYNC_ENABLED: "false", ZEPP_DB_PATH: file, MCP_SECRET: "fixture-mcp-secret", ZEPP_APP_TOKEN: "fixture-token", ZEPP_USER_ID: "123", ZEPP_REGION_HOST: "https://api-mifit-us3.zepp.com", USER_TIMEZONE: "UTC", OAUTH_OWNER_PASSWORD: password, OAUTH_ISSUER: `http://127.0.0.1:${port}`, OAUTH_STORE_PATH: path.join(dir, "oauth.json") }
  });
  const exited = new Promise<void>(resolve => { child.once("exit", () => resolve()); child.once("error", () => resolve()); });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await viWait(async () => (await fetch(origin + "/health")).ok);
    const setId = (() => { const s = new ZeppStore(file); try { return s.effectiveStrengthSets(workout.workout_id)[0]!.id; } finally { s.close(); } })();
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "update_strength_set", arguments: { workout_id: workout.workout_id, set_id: setId, exercise: "Fixture Row", reps: 11, weight_kg: 20 } } });
    const rpc = await fetch(origin + "/mcp", { method: "POST", headers: { authorization: "Bearer fixture-mcp-secret", "content-type": "application/json", accept: "application/json, text/event-stream" }, body });
    expect(rpc.status).toBe(200);
    expect(await rpc.text()).toContain("Fixture Row");
    const login = await fetch(origin + "/dashboard/login");
    const csrfCookie = login.headers.getSetCookie().find(value => value.startsWith("zepp_dash_csrf="))!.split(";")[0]!;
    const csrf = csrfCookie.split("=")[1]!;
    const signIn = await fetch(origin + "/dashboard/login", { method: "POST", redirect: "manual", headers: { origin, cookie: csrfCookie, "x-forwarded-proto": "http", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf, password }) });
    expect(signIn.status).toBe(303);
    const session = signIn.headers.getSetCookie().find(value => value.startsWith("zepp_dash="))!.split(";")[0]!;
    const dashboard = await fetch(origin + "/dashboard/api/workouts/" + encodeURIComponent(workout.workout_id), { headers: { cookie: session } });
    expect(dashboard.status).toBe(200);
    expect((await dashboard.json() as any).sets).toMatchObject([{ exercise: "Fixture Row", reps: 11, weight_kg: 20 }]);
  } finally {
    child.kill();
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }
}, 20_000);

async function viWait(check: () => Promise<boolean>): Promise<void> {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    try { if (await check()) return; } catch { /* server starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Fixture server did not start");
}
