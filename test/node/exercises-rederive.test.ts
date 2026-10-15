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