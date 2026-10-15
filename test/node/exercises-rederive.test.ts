import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { ZeppStore } from "../../src/store/store";
import { seedDashboardDb } from "./dashboard-seed";

let dir: string;
let file: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zepp-rederive-"));
  file = path.join(dir, "zepp.db");
  seedDashboardDb(file);
  const db = new DatabaseSync(file);
  const s = db.prepare("INSERT INTO strength_sets (workout_id, seq, set_no, exercise, action_type, reps, weight_kg, duration_s, avg_hr_bpm) VALUES (?,?,?,?,?,?,?,?,?)");
  s.run("w-str", 3, 3, "unknown_66", 66, 9, 30, 40, 100); // catalog id, stored before the catalog existed
  s.run("w-str", 4, 4, "unknown_0", 0, 5, null, 20, 100); // unassigned: must stay unknown_0
  db.close();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const labels = () => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT action_type AS a, exercise AS e FROM strength_sets ORDER BY seq").all().map((r: any) => [r.a, r.e]); } finally { db.close(); }
};

describe("rederiveExerciseNames", () => {
  it("renames stored labels from the tables, leaves unknown and id 0 alone, and is idempotent", () => {
    const store = new ZeppStore(file);
    try {
      expect(store.rederiveExerciseNames()).toBe(2); // 64 and 66 (6 was already right, 9999 and 0 stay unknown)
      expect(labels()).toEqual([[64, "Pull Up"], [6, "Bench Press"], [9999, "unknown_9999"], [66, "Seated Cable Row"], [0, "unknown_0"]]);
      expect(store.rederiveExerciseNames()).toBe(0);
      expect(labels()).toHaveLength(5);
    } finally { store.close(); }
  });

  it("dashboard exercises endpoint reports name source and flags only unmapped ids", () => {
    const data = new DashboardData(file, { timezone: "Asia/Jakarta" });
    try {
      const r: any = data.exercises();
      const byId = Object.fromEntries(r.exercises.map((e: any) => [e.action_type, e]));
      expect(byId[64]).toMatchObject({ name: "Pull Up", known: true, source: "owner" });
      expect(byId[66]).toMatchObject({ name: "Seated Cable Row", known: true, source: "catalog" });
      expect(byId[9999]).toMatchObject({ name: "unknown_9999", known: false, source: "unknown" });
      expect(byId[0]).toMatchObject({ name: "unknown_0", known: false, source: "unknown" });
      expect(r.unknown_count).toBe(2);
    } finally { data.close(); }
  });
});
describe("rederiveSportTypes", () => {
  it("relabels unknown:<code> workouts from the catalog, updates summary_json, and is idempotent", () => {
    const f = path.join(dir, "sport.db");
    seedDashboardDb(f);
    const db = new DatabaseSync(f);
    const ins = db.prepare("INSERT INTO workouts (workout_id, activity_type, zepp_type, started_at, started_date, ended_at, duration_s, distance_m, calories_kcal, avg_hr_bpm, max_hr_bpm, source_scope, summary_json, raw_json, strength_checked, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const u = "2026-10-15T00:00:00Z";
    ins.run("u22", "unknown:22", 22, "2026-09-20T01:00:00.000Z", "2026-09-20", "2026-09-20T02:00:00.000Z", 3600, 9475, 100, 134, 150, "device", JSON.stringify({ activity_type: "unknown:22", zepp_type: 22 }), "{}", 0, u);
    ins.run("u24", "unknown:24", 24, "2026-09-21T01:00:00.000Z", "2026-09-21", "2026-09-21T02:00:00.000Z", 1200, null, 50, 120, 130, "device", "not json", "{}", 0, u);
    ins.run("u105", "unknown:105", 105, "2026-09-22T01:00:00.000Z", "2026-09-22", "2026-09-22T02:00:00.000Z", 1200, null, 50, 120, 130, "device", "{}", "{}", 0, u);
    ins.run("titled", "unknown:22", 22, "2026-09-23T01:00:00.000Z", "2026-09-23", "2026-09-23T02:00:00.000Z", 1200, null, 50, 120, 130, "device", "{}", "{}", 0, u);
    db.prepare("UPDATE workouts SET activity_type = 'trail_walk' WHERE workout_id = 'titled'").run();
    db.close();
    const store = new ZeppStore(f);
    try {
      expect(store.rederiveSportTypes()).toBe(2); // u22 and u24 only
      expect(store.rederiveSportTypes()).toBe(0);
    } finally { store.close(); }
    const ro = new DatabaseSync(f, { readOnly: true });
    try {
      const rows = Object.fromEntries((ro.prepare("SELECT workout_id AS id, activity_type AS t, summary_json AS j FROM workouts WHERE workout_id IN ('u22','u24','u105','titled')").all() as any[]).map(r => [r.id, r]));
      expect(rows.u22.t).toBe("hiking");
      expect(JSON.parse(rows.u22.j)).toMatchObject({ activity_type: "hiking", zepp_type: 22, type_confidence: "inferred" });
      expect(rows.u24.t).toBe("indoor_fitness");
      expect(rows.u105.t).toBe("unknown:105");
      expect(rows.titled.t).toBe("trail_walk");
    } finally { ro.close(); }
    const data = new DashboardData(f, { timezone: "Asia/Jakarta" });
    try {
      const w: any = data.workouts({ limit: 50, offset: 0 });
      const byId = Object.fromEntries(w.workouts.map((x: any) => [x.workout_id, x]));
      expect(byId.u22).toMatchObject({ activity_type: "hiking", type_confidence: "inferred" });
      expect(byId.u105.type_confidence).toBeNull();
      expect(byId["zepp:1760482800:cnVuLmRldmljZQ"].type_confidence).toBeNull(); // verified outdoor_running: no badge
      expect(byId.titled.type_confidence).toBeNull();
      expect(w.types.find((x: any) => x.type === "hiking")).toMatchObject({ n: 1, type_confidence: "inferred" });
      expect((data.workout("u22") as any).workout.type_confidence).toBe("inferred");
    } finally { data.close(); }
  });
});