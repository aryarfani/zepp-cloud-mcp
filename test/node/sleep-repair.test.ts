import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardData } from "../../src/dashboard/data";
import { ZeppStore } from "../../src/store/store";
import { normalizeBandData } from "../../src/zepp/activity";

const TZ = "Asia/Jakarta";
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function dbFile() {
  const d = mkdtempSync(path.join(tmpdir(), "zepp-sleep-"));
  dirs.push(d);
  return path.join(d, "zepp.db");
}

/** Old behaviour: sleep_date = local date of the BEDTIME. Reproduces the doubled and gap dates from production. */
const OLD_NIGHTS = [
  // started_at, ended_at, old key (bedtime date), duration
  ["2026-10-05T16:47:00.000Z", "2026-10-06T00:55:00.000Z", "2026-10-05", 29280], // 5 Oct 23:47 -> 6 Oct 07:55
  ["2026-10-06T18:23:00.000Z", "2026-10-07T00:50:00.000Z", "2026-10-07", 23220], // 7 Oct 01:23 -> 07:50 (old key = 7 Oct)
  ["2026-10-07T16:10:00.000Z", "2026-10-07T23:40:00.000Z", "2026-10-07", 27000], // 7 Oct 23:10 -> 8 Oct 06:40 (old key = 7 Oct too: doubled)
  ["2026-10-09T15:30:00.000Z", "2026-10-09T23:30:00.000Z", "2026-10-09", 28800]  // 9 Oct 22:30 -> 10 Oct 06:30
] as const;

function seedOld(file: string) {
  new ZeppStore(file).close();
  const db = new DatabaseSync(file);
  const ins = db.prepare("INSERT INTO sleep (started_at, sleep_date, ended_at, duration_s, score, stages_json, source_scope, updated_at) VALUES (?,?,?,?,?,?,?,?)");
  for (const [s, e, k, d] of OLD_NIGHTS) ins.run(s, k, e, d, 70, "[]", "device", "2026-10-10T00:00:00Z");
  db.close();
}

const keys = (file: string) => {
  const db = new DatabaseSync(file);
  const rows = db.prepare("SELECT started_at, sleep_date FROM sleep ORDER BY started_at").all() as Array<{ started_at: string; sleep_date: string }>;
  db.close();
  return rows.map(r => r.sleep_date);
};

describe("repairSleepDates (one-off wake-date migration)", () => {
  it("before the repair two nights share 7 Oct and 6, 8 and 10 Oct are empty (the reported bug)", () => {
    const file = dbFile(); seedOld(file);
    expect(keys(file)).toEqual(["2026-10-05", "2026-10-07", "2026-10-07", "2026-10-09"]);
  });

  it("re-keys every row to its wake date: one night per date, none summed, gaps filled", () => {
    const file = dbFile(); seedOld(file);
    const store = new ZeppStore(file);
    expect(store.repairSleepDates(TZ)).toEqual({ rows: 3, total: 4 });
    store.close();
    expect(keys(file)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-10"]);
    const data = new DashboardData(file, { timezone: TZ, now: () => Date.parse("2026-10-12T05:00:00Z") });
    const t: any = data.trends(14);
    expect(t.sleep.map((s: any) => [s.sleep_date, s.duration_s, s.sessions])).toEqual([
      ["2026-10-06", 29280, 1], ["2026-10-07", 23220, 1], ["2026-10-08", 27000, 1], ["2026-10-10", 28800, 1]
    ]);
    data.close();
  });

  it("is idempotent: the second run is a no-op even if a row is edited afterwards", () => {
    const file = dbFile(); seedOld(file);
    const store = new ZeppStore(file);
    expect(store.repairSleepDates(TZ)).not.toBeNull();
    const db = new DatabaseSync(file);
    db.prepare("UPDATE sleep SET sleep_date = '1999-01-01' WHERE started_at = ?").run(OLD_NIGHTS[0][0]);
    db.close();
    expect(store.repairSleepDates(TZ)).toBeNull(); // already applied: touches nothing
    store.close();
    expect(keys(file)[0]).toBe("1999-01-01");
    const again = new ZeppStore(file); // reopening does not re-run either
    expect(again.repairSleepDates(TZ)).toBeNull();
    again.close();
  });

  it("on an empty database it records the fix and changes nothing", () => {
    const file = dbFile();
    const store = new ZeppStore(file);
    expect(store.repairSleepDates(TZ)).toEqual({ rows: 0, total: 0 });
    expect(store.repairSleepDates(TZ)).toBeNull();
    store.close();
  });

  it("keeps the primary key and every other column", () => {
    const file = dbFile(); seedOld(file);
    const store = new ZeppStore(file); store.repairSleepDates(TZ); store.close();
    const db = new DatabaseSync(file);
    const r = db.prepare("SELECT * FROM sleep WHERE started_at = ?").get(OLD_NIGHTS[1][0]) as any;
    db.close();
    expect(r).toMatchObject({ ended_at: OLD_NIGHTS[1][1], duration_s: 23220, score: 70, source_scope: "device" });
  });

  it("coverage first/last dates are wake dates, and a fresh sync of the same nights agrees with the repair", () => {
    const file = dbFile(); seedOld(file);
    const store = new ZeppStore(file); store.repairSleepDates(TZ);
    expect(store.stats().sleep).toMatchObject({ rows: 4, min_date: "2026-10-06", max_date: "2026-10-10" });
    // new code writing the same nights (upsert on started_at) lands on the same keys: no duplicates
    const band = normalizeBandData({ data: { items: OLD_NIGHTS.map(([s, e]) => ({
      date_time: "x", deviceId: "d", summary: btoa(JSON.stringify({ tz: 25200, slp: { st: Date.parse(s) / 1000, ed: Date.parse(e) / 1000, wk: 0, stage: [] } }))
    })) } }, TZ);
    store.upsertSleep(band.sleep, "2026-10-11T00:00:00Z");
    store.close();
    expect(keys(file)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-10"]);
  });
});
