# SQLite-backed workout reads and strength-set corrections

## Intent

Allow the owner to correct strength workouts through MCP, including adding and deleting sets and changing an individual set's exercise, repetitions and weight. The dashboard and MCP must show the same corrected data. Changes are local to this service and are not sent to Zepp Cloud.

## Approaches

- **Separate corrections from synced data (selected):** preserve Zepp's original sets and layer local additions, updates and deletions over them. A sync can refresh the source without erasing the owner's changes. This requires stable identifiers and merge logic.
- **Edit synced rows directly:** simpler storage, but every refresh and exercise-name re-derivation must distinguish and preserve local changes. This couples sync to editing and makes deletions difficult to preserve.

## Scope and behavior

- Change MCP `list_workouts`, `get_workout` and `get_strength_sets` to use the local SQLite store. Other MCP health-data reads, including workout samples and routes, retain their current sources.
- Expose MCP operations to create, update and delete individual strength sets belonging to an existing strength workout. Reads return stable set identifiers for targeting subsequent edits. A new set needs an exercise name, reps and either a nonnegative weight in kg or an explicit bodyweight value. Updates can change these fields independently; deletion affects the local view only.
- A correction applies to a specific set, not globally to an exercise ID. In particular, `unknown_0` can represent different exercises. Preserve original values for synced sets and distinguish locally added sets. Existing recorded duration and heart rate remain intact unless a set is deleted; new sets have no fabricated measurements.
- Corrected names, reps and weights must appear consistently in the workout detail, exercise summaries, strength rollups and relevant dashboard views. Compute volume and totals from effective values. If a name has no verified exercise ID, do not invent a muscle mapping; retain a verified mapping only when the selected exercise supports it.
- MCP mutations must be correctly annotated as write or destructive operations, validate inputs and target ownership, and return useful errors for missing workouts or sets. They must use the existing authentication boundary; no anonymous write endpoint is introduced. Dashboard editing controls are not part of this scope.

## Sync and freshness

- Before a SQLite-backed MCP workout or strength-set read, check the last successful sync. If it is older than a configurable threshold (default 24 hours), initiate a sync before responding. Coordinate concurrent reads with the existing single-sync guard: wait for the in-progress run rather than launching duplicate runs, subject to a bounded wait. If sync fails or cannot complete in time, return available local results with explicit freshness and failure information.
- A recent successful sync alone does not prove historical coverage. Track or consult coverage for the requested range and report missing or uncertain coverage; never silently imply completeness. Fetch missing history when supported by the sync mechanism and report any remaining gap. For a requested workout absent from the store, attempt an appropriate targeted refresh before reporting it missing, when feasible.
- Existing sync fetches strength detail only for workouts not yet checked, so a normal sync is not sufficient to refresh an already-stored workout. Define and implement a bounded detail refresh path for stale or missing details. All refresh paths must preserve local additions, updates and deletions.
- Associate source-set corrections with stable source identity, not a mutable display index alone. If an upstream refresh cannot match an edited source set unambiguously, retain the correction and report a conflict rather than applying it to a different set or silently discarding it. Define the matching and conflict behavior in implementation and test it against reordered or changed source rows.

## Data and compatibility

Add versioned SQLite migrations for correction and identity metadata. Keep source data and user changes separable and protect both in backups. Existing data must remain readable after migration, and corrected data must survive restart, sync, and exercise-name re-derivation. Preserve existing response shapes where practical; document additions such as set IDs, source, freshness, coverage and conflicts. Clearly identify bodyweight separately from zero-weight values if the existing model cannot distinguish them.

The standalone Cloudflare Worker has no local SQLite store. Keep its existing behavior or explicitly report that local editing is unavailable; do not introduce a silent dependency on Node's store.

## Verification

- Test migration of existing workouts and stable identifiers; create, partial update, delete, invalid inputs and missing targets.
- Test that names, reps, weights, rollups and dashboard views agree, including multiple distinct `unknown_0` sets and bodyweight.
- Test refresh, reordering, name re-derivation, restart and conflict handling without losing or misapplying corrections.
- Test stale, fresh, failed and concurrent syncs, missing historical coverage and absent workouts. Confirm unrelated MCP tools retain their behavior.
- Before deployment, back up the database and app, verify the intended revision and service health, and exercise the affected MCP and dashboard paths without changing real workout data unless explicitly authorized.

## Decisions for implementation

Choose the exact configurable threshold setting, stable matching algorithm, historical coverage representation, bounded wait and tool names while preserving the behavior above. Report any material limitation that prevents reliable matching or completeness before deployment.
