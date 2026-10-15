import { describe, expect, it } from "vitest";
import { nextRunAfter, startSyncScheduler } from "../../src/sync/scheduler";
import type { SyncService } from "../../src/sync/service";
import { parseSyncConfig } from "../../src/sync/config";

describe("nextRunAfter", () => {
  it("finds the next local wall-clock hour (Asia/Jakarta = UTC+7)", () => {
    // 2026-08-31 10:00 Jakarta -> next 04:00 Jakarta is 2026-09-01 04:00 = 2026-08-31T21:00Z
    expect(nextRunAfter(Date.parse("2026-08-31T03:00:00Z"), 4, "Asia/Jakarta").toISOString()).toBe("2026-08-31T21:00:00.000Z");
    // exactly at 04:00 local the next run is the following day
    expect(nextRunAfter(Date.parse("2026-08-30T21:00:00Z"), 4, "Asia/Jakarta").toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("handles half-hour offset zones", () => {
    // Asia/Kolkata is UTC+5:30: 04:00 local = 22:30Z the day before
    expect(nextRunAfter(Date.parse("2026-08-31T00:00:00Z"), 4, "Asia/Kolkata").toISOString()).toBe("2026-08-31T22:30:00.000Z");
  });
});

function fakeService(enabled = true) {
  const runs: string[] = [];
  let next: Date | null = null;
  const service = {
    config: { ...parseSyncConfig({}), enabled },
    run: async (trigger: string) => { runs.push(trigger); return undefined; },
    setNextRun: (d: Date | null) => { next = d; }
  } as unknown as SyncService;
  return { service, runs, next: () => next };
}

function fakeTimers() {
  const timers: Array<{ fn: () => void | Promise<void>; ms: number; cleared: boolean }> = [];
  return {
    timers,
    setTimer: (fn: () => void | Promise<void>, ms: number) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimer: (h: unknown) => { (h as { cleared: boolean }).cleared = true; }
  };
}

const NOW = Date.parse("2026-08-31T03:00:00Z");

describe("startSyncScheduler", () => {
  it("catches up on start when there has been no successful sync", async () => {
    const { service, runs } = fakeService();
    const t = fakeTimers();
    startSyncScheduler({ service, lastSuccessAt: () => null, timezone: "Asia/Jakarta", now: () => NOW, startupDelayMs: 10, ...t });
    expect(t.timers[0]!.ms).toBe(10);
    await t.timers[0]!.fn();
    expect(runs).toEqual(["startup"]);
    expect(t.timers).toHaveLength(2); // next daily run scheduled afterwards
    expect(t.timers[1]!.ms).toBe(Date.parse("2026-08-31T21:00:00Z") - NOW);
  });

  it("catches up when the last success is older than 24h", async () => {
    const { service, runs } = fakeService();
    const t = fakeTimers();
    startSyncScheduler({ service, lastSuccessAt: () => "2026-08-29T00:00:00.000Z", timezone: "Asia/Jakarta", now: () => NOW, ...t });
    await t.timers[0]!.fn();
    expect(runs).toEqual(["startup"]);
  });

  it("does not run on start when the last success is recent; waits for SYNC_HOUR", async () => {
    const { service, runs, next } = fakeService();
    const t = fakeTimers();
    startSyncScheduler({ service, lastSuccessAt: () => "2026-08-31T01:00:00.000Z", timezone: "Asia/Jakarta", now: () => NOW, ...t });
    expect(runs).toEqual([]);
    expect(t.timers).toHaveLength(1);
    expect(next()?.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    await t.timers[0]!.fn();
    expect(runs).toEqual(["scheduled"]);
    expect(t.timers).toHaveLength(2); // re-armed
  });

  it("does nothing when disabled, and stop() cancels the pending timer", () => {
    const off = fakeService(false);
    const t = fakeTimers();
    startSyncScheduler({ service: off.service, lastSuccessAt: () => null, timezone: "Asia/Jakarta", now: () => NOW, ...t });
    expect(t.timers).toHaveLength(0);

    const on = fakeService();
    const t2 = fakeTimers();
    const sched = startSyncScheduler({ service: on.service, lastSuccessAt: () => "2026-08-31T01:00:00.000Z", timezone: "Asia/Jakarta", now: () => NOW, ...t2 });
    sched.stop();
    expect(t2.timers[0]!.cleared).toBe(true);
  });
});