// Synthetic Zepp running workout (25 min, ~3.2 km) in the real payload encodings, for analysis / sync / dashboard tests.
export const RUN_TRACKID = Math.floor(Date.parse("2026-08-30T23:00:00Z") / 1000);
export const RUN_SECONDS = 1500;
const POINTS = RUN_SECONDS + 1;

export function runDetail(opts: { gps?: boolean } = {}): Record<string, unknown> {
  const time: number[] = [], pace: string[] = [], hr: string[] = [], coords: string[] = [], dist: string[] = [], alt: string[] = [], gait: string[] = [];
  let meters = 0, prevHr = 0;
  for (let i = 0; i < POINTS; i++) {
    time.push(i === 0 ? 0 : 1);
    const secPerM = 0.47 + 0.03 * Math.sin(i / 120);
    pace.push(secPerM.toFixed(4));
    meters += i === 0 ? 0 : 1 / secPerM;
    const bpm = Math.round(110 + Math.min(i, 400) / 10 + 8 * Math.sin(i / 90));
    hr.push(i === 0 ? "0," + bpm : "1," + (bpm - prevHr));
    prevHr = bpm;
    // 1e-8 degree steps: head north, then east (about 2 m/s), starting near Jakarta.
    const north = i < 750 ? 1800 : 0, east = i < 750 ? 0 : 1800;
    coords.push(i === 0 ? "-620000000,10680000000" : north + "," + east);
    if (i % 5 === 0) dist.push((i === 0 ? 0 : 5) + "," + Math.round(meters * 100));
    if (i % 10 === 0) alt.push((i === 0 ? 0 : 10) + "," + Math.round((20 + 6 * Math.sin(i / 200)) * 100));
    if (i % 5 === 0) gait.push((i === 0 ? 0 : 5) + ",0,0," + (160 + (i % 20)));
  }
  const ms = [470, 480, 490];
  const kilo = ms.map((s, k) => [k, s, 0, 0, 140 + k * 3, 0, s * 1000, 0, 0, 0, 0, 0, "w2geohash", 168 + k].join(",")).join(";");
  return {
    trackid: String(RUN_TRACKID), time: time.join(";"), pace: pace.join(";"), heart_rate: hr.join(";"),
    ...(opts.gps === false ? {} : { longitude_latitude: coords.join(";") }),
    currentDistance: dist.join(";"), time_delta_altitude: alt.join(";"), gait: gait.join(";"), kilo_pace: kilo
  };
}

export const RUN_HISTORY_EXTRA: Record<string, unknown> = {
  run_time: String(RUN_SECONDS), dis: "3200.0", avg_pace: "0.4688", max_pace: "0.4200", avg_heart_rate: "128.0", max_heart_rate: 150, min_heart_rate: 100,
  avg_frequency: 168, max_frequency: 179, total_step: 4200, avg_stride_length: 76, calorie: "230.0", exercise_load: 61, te: "27", anaerobic_te: "5", VO2_max: 44,
  heart_range: "300,108;400,135;500,153;300,171;0,190"
};