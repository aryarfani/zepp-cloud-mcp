import { expect, it } from "vitest";
import { ZeppStore } from "../../src/store/store";
import { createLocalWorkoutAccess } from "../../src/mcp/local-workouts";
import { normalizeWorkoutSummary } from "../../src/zepp/workouts";
import { createZeppMcpServer } from "../../src/mcp/server";
import { createServices } from "../../src/services";
import { parseConfig } from "../../src/config";
import { createApp } from "../../src/app";

it("returns the effective sets in MCP reads and supports CRUD", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "Asia/Jakarta")!;
    store.upsertWorkout(workout, "2023-11-15", {}, "2026-01-01T00:00:00Z");
    store.replaceStrengthSets(workout.workout_id, [{ set: 1, exercise: "unknown_0", action_type: 0, reps: 8, weight_kg: null, duration_s: 30, avg_hr_bpm: 100 }]);
    const access = createLocalWorkoutAccess({ store, timezone: "Asia/Jakarta", refresh: async () => [] });
    const first = await access.sets(workout.workout_id);
    const id = first.data!.sets[0]!.id;
    await access.update(workout.workout_id, id, { exercise: "Rows", reps: 10, weight_kg: 20 });
    const created = await access.create(workout.workout_id, { exercise: "Bench", reps: 5, weight_kg: null });
    expect((await access.sets(workout.workout_id)).data).toMatchObject({ sets: [{ origin: "zepp", corrected: true }, { origin: "manual", corrected: false }], totals: { sets: 2, reps: 15, volume_kg: 200 }, exercises: [{ exercise: "Rows" }, { exercise: "Bench" }] });
    await access.remove(workout.workout_id, created.data!.id);
    expect((await access.sets(workout.workout_id)).data!.sets).toHaveLength(1);
    expect((await access.list("2023-11-15", "2023-11-15", undefined, 10)).data).toHaveLength(1);
    store.saveWorkoutAnalysis(workout.workout_id, { v: 1, series: { hr_bpm: [90], pace_s_km: [400], cadence_spm: [70], alt_m: [2] }, route: { points: [[1, 2]] } } as any, "2026-01-01T00:00:00Z");
    const detail = await access.get(workout.workout_id);
    expect(detail.data!.available_detail).toEqual(expect.arrayContaining(["strength_sets", "heart_rate", "pace", "cadence", "elevation", "route"]));
    expect(detail.meta.warnings.join(" ")).toMatch(/detail availability.*incomplete/i);
  } finally { store.close(); }
});

it("requires MCP authentication and exposes the new tools through the HTTP handler", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const env = { MCP_SECRET: "test-secret", ZEPP_APP_TOKEN: "test-token", ZEPP_USER_ID: "123", ZEPP_REGION_HOST: "https://api-mifit-us2.zepp.com", USER_TIMEZONE: "UTC" } as Env;
    const app = createApp({ env, oauth: null, localWorkouts: createLocalWorkoutAccess({ store, timezone: "UTC", refresh: async () => [] }) });
    const workout = normalizeWorkoutSummary({ trackid: "1700000000", source: "run.device", endTime: 1700000600, type: 52 }, "UTC")!;
    store.upsertWorkout(workout, "2023-11-14", {}, "2026-01-01T00:00:00Z");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const request = (auth: boolean) => new Request("https://zepp.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: "Bearer test-secret" } : {}) }, body });
    expect((await app(request(false))).status).toBe(401);
    const response = await app(request(true));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("update_strength_set");
    const callBody = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_strength_set", arguments: { workout_id: workout.workout_id, exercise: "Bench Press", reps: 8, weight_kg: 40 } } });
    const call = await app(new Request("https://zepp.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer test-secret" }, body: callBody }));
    expect(call.status).toBe(200);
    expect(await call.text()).toContain("Bench Press");
    expect(store.effectiveStrengthSets(workout.workout_id)).toMatchObject([{ exercise: "Bench Press", reps: 8, weight_kg: 40 }]);
    const setId = store.effectiveStrengthSets(workout.workout_id)[0]!.id;
    const callTool = async (name: string, args: Record<string, unknown>) => app(new Request("https://zepp.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }) }));
    const update = await callTool("update_strength_set", { workout_id: workout.workout_id, set_id: setId, exercise: "Incline Press", reps: 11, weight_kg: null });
    expect(update.status).toBe(200);
    expect(await update.text()).toContain("Incline Press");
    expect(store.effectiveStrengthSets(workout.workout_id)).toMatchObject([{ exercise: "Incline Press", reps: 11, weight_kg: null }]);
    const remove = await callTool("delete_strength_set", { workout_id: workout.workout_id, set_id: setId });
    expect(remove.status).toBe(200);
    expect(await remove.text()).toContain("deleted");
    expect(store.effectiveStrengthSets(workout.workout_id)).toHaveLength(0);
  } finally { store.close(); }
});

it("registers write tools and routes workout reads to local access", async () => {
  const store = new ZeppStore(":memory:");
  try {
    const services = createServices(parseConfig({ MCP_SECRET: "test-secret", ZEPP_APP_TOKEN: "test-token", ZEPP_USER_ID: "123", ZEPP_REGION_HOST: "https://api-mifit-us2.zepp.com", USER_TIMEZONE: "UTC" } as Env));
    const access = createLocalWorkoutAccess({ store, timezone: "UTC", refresh: async () => ["test warning"] });
    const server = createZeppMcpServer(services, { localWorkouts: access }) as any;
    expect(server._registeredTools.create_strength_set).toBeDefined();
    expect(server._registeredTools.delete_strength_set.annotations.destructiveHint).toBe(true);
    const result = await server._registeredTools.list_workouts.handler({ start_date: "2026-01-01", end_date: "2026-01-02", limit: 50 });
    expect(JSON.parse(result.content[0].text).meta).toMatchObject({ source: "sqlite", warnings: ["test warning"] });
  } finally { store.close(); }
});
