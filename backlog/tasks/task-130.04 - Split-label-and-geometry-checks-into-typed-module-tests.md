---
id: TASK-130.04
title: Split label and geometry checks into typed module tests
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 01:03'
updated_date: '2026-08-28 12:11'
labels: []
dependencies:
  - TASK-130.01
  - TASK-130.06
references:
  - scripts/check-labels.mjs
  - scripts/check-geometry.mjs
  - src/runtime/engine/labels.ts
  - src/runtime/engine/geometry.ts
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-labels and check-geometry mix pure transformations, malformed-input recovery, server-route behavior, and large case matrices in 3,228 lines. Split them by owning contract before conversion so no replacement test becomes another monolith.

Keep public-entrypoint tests with the owning module. Route and persisted-note cases belong in system tests only when they need a real process or HTTP boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 check-labels and check-geometry are replaced by typed native tests grouped by public label conversion, geometry validation, malformed recovery, and route behavior.
- [x] #2 Every current label binding, ID, normalization, z-order, malformed-geometry, finite-number, and exact-output assertion is represented by a named test through the relevant public interface.
- [x] #3 Pure tests do not start a server; route tests use the real route boundary and prove the note or board remains unchanged on refusal.
- [x] #4 Fixtures have explicit types or schema parsing at their input boundary, and no test relies on computed imports that erase module types.
- [x] #5 Every test file is at most 500 lines and no replacement file receives a complexity, explicit-any, unsafe-assertion, or console exemption.
- [x] #6 Focused parity checks demonstrate a known label and geometry regression fails both the old and new coverage before the legacy scripts are deleted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependencies and ownership. Rebase after TASK-130.01 and TASK-130.06. Integrate only after TASK-130.02 has landed its real-checkout inventory. Pure runtime behavior stays module-local. UI and runtime crossings plus real HTTP or persisted-note behavior stay under tests/system. TASK-130.06 owns tests/system/support/owned-canvas.ts, and every route test here imports that typed support directly. This task owns the serialized package mapping and deletion for check-labels and check-geometry. TASK-130.11 later consolidates final lane names and layout and removes remaining non-check MJS. It does not delete these checks.

2. Exact legacy-to-native mapping.
Module-owned by src/runtime/engine:
- scripts/check-labels.mjs pure input, default, index, and repair cases -> src/runtime/engine/tests/label-input.test.ts, label-repair.test.ts, and label-placement.test.ts.
- scripts/check-geometry.mjs pure validation, extents, binding, and consumer cases -> src/runtime/engine/tests/geometry-validation.test.ts, geometry-extents.test.ts, arrow-geometry.test.ts, and geometry-consumers.test.ts.
- src/runtime/engine/tests/fixtures/label-cases.ts and geometry-cases.ts are same-owner typed fixture data. They contain captured inputs and exact outputs, not alternate converters or broad assertion helpers.
Tests/system-owned under tests/system/label-geometry:
- scripts/check-labels.mjs hostile browser-cycle and save or reopen cases -> label-human-round-trip.test.ts and label-route.test.ts.
- scripts/check-geometry.mjs real board, wire, and route cases -> geometry-route.test.ts.
- support/label-cycle.ts is same-owner setup for the hostile pane model. fixtures/route-cases.ts is schema-parsed request and response data.
There is no lifecycle helper in this directory. label-route.test.ts and geometry-route.test.ts import tests/system/support/owned-canvas.ts from TASK-130.06.

3. Contracts under 500 lines. label-input.test.ts owns applyElementInput order, ID minting, label spending and measurement, version, updatedAt, delta, repairIndices, expansion parity, defaults, points, and exact element order. label-repair.test.ts owns stable and salted IDs, rename, clear, retype, absence, delete, stale seeds, standalone, dangling, one-way binding, and fixed-point repair. label-placement.test.ts owns anchor, move, resize, reroute, drift rescue, alignment, and captured coordinates. label-human-round-trip.test.ts owns the exact 25 hostile cycles, 50 write or read cycles, human and agent precedence, frontend normalization, and z-order without a server. label-route.test.ts owns four-to-eight expansion, move, resize, repoint, rebind, rename, save or reopen, zero persisted seeds, no drift, and the existing less-than-0.5 placement tolerance.

geometry-validation.test.ts names every non-finite field, tombstone exemption, zero and negative finite acceptance, malformed Helvetica refusal, and caller Map immutability. geometry-extents.test.ts owns four directions, bends, freedraw, fallback, and the 0.5 measurement tolerance. arrow-geometry.test.ts owns focus and gap, 0.001 endpoint bounds, the bit-exact pinned solver value, rotations, neighboring shapes, inside bindings, bends, and exported label placement. geometry-consumers.test.ts owns compare, promotion, describe, layout regions, clusters, selection, and exact outputs. geometry-route.test.ts owns real-board arrow size, reroute, repoint, region query, spent start and end input, human rebind and unbind, exact focus, gap, nudge, restore, and malformed refusal with byte-identical note, board version, and element JSON.

4. Fixture and lifecycle discipline. Every fixture has an explicit type or schema. No computed import erases module types. Pure tests start no listener. Each route describe scope owns one TASK-130.06 canvas handle and vault and awaits idempotent disposal on success or failure. There is no TASK-130.11 fallback, declaration-only shim, or copied process helper. Expected bytes, IDs, coordinates, order, finite cases, and tolerances remain literal.

5. Parity and serialized cutover. Native files may be authored in parallel only because their paths are disjoint. In a disposable checkout, reintroduce one outbound label seed and break one negative-coordinate extent or binding-focus calculation. scripts/check-labels.mjs and all mapped label tests must fail the first regression. scripts/check-geometry.mjs and all mapped geometry tests must fail the second. The native malformed-route refusal must also prove exact note and board non-mutation. Once parity is recorded, the reconciliation owner performs one serialized integration:
- Map package.json test:labels to bun test src/runtime/engine/tests/label-input.test.ts src/runtime/engine/tests/label-repair.test.ts src/runtime/engine/tests/label-placement.test.ts tests/system/label-geometry/label-human-round-trip.test.ts tests/system/label-geometry/label-route.test.ts.
- Map test:geometry to bun test src/runtime/engine/tests/geometry-validation.test.ts src/runtime/engine/tests/geometry-extents.test.ts src/runtime/engine/tests/arrow-geometry.test.ts src/runtime/engine/tests/geometry-consumers.test.ts tests/system/label-geometry/geometry-route.test.ts.
- Delete scripts/check-labels.mjs and scripts/check-geometry.mjs.
Do not land native tests before this mapping and deletion cutover. TASK-130.02 inventory must remain green.

6. Validation. Run:
bun test src/runtime/engine/tests/label-input.test.ts src/runtime/engine/tests/label-repair.test.ts src/runtime/engine/tests/label-placement.test.ts src/runtime/engine/tests/geometry-validation.test.ts src/runtime/engine/tests/geometry-extents.test.ts src/runtime/engine/tests/arrow-geometry.test.ts src/runtime/engine/tests/geometry-consumers.test.ts
bun test tests/system/label-geometry/label-human-round-trip.test.ts tests/system/label-geometry/label-route.test.ts tests/system/label-geometry/geometry-route.test.ts
Then run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially after integration. Do not parallelize broad validation. Acceptance requires both package keys to reach every mapped file exactly once, both predecessor scripts to be absent, the TASK-130.06 lifecycle tests to remain green, and the real inventory to pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation completed through READY_FOR_REVIEW at fixed base 19c04512fd0157aedb9ee90ab44988702c18d53e. Added the reviewed seven public-root runtime tests, two typed same-owner fixture files, three system route/round-trip tests, and their two owner-local support/fixture files. Pure tests start no server; route tests import TASK-130.06 owned-canvas directly. The native malformed geometry batch refusal asserts status/body plus byte-identical note, unchanged board version, and byte-identical element JSON.

Assertion audit: a disposable TSV mapped all 257 static predecessor assert calls one-to-one to 257 native assert calls, with unmapped 0, duplicate owners 0, and unclaimed 0; SHA-256 e83dd94de5939b19c31ae90e0fdec0572f932a80cb5571181beb6be05811ee3e. The four non-literal mappings are only typed lookup/helper spellings, with the same predicates and messages. IDs, bytes, ordering, coordinates, normalization, binding repair, z-order, malformed cases, finite fields, 0.001/0.5 tolerances, pinned solver bits, 25/50 cycles, exact route refusal, and note/board/element nonmutation were source-audited.

Disposable mutation parity before cutover: restoring outbound label seeds made scripts/check-labels.mjs exit 1 (12/183 failed) and the native label command exit 1 (4 failures, including the write-boundary seed assertion). Clamping negative path minima to zero made scripts/check-geometry.mjs exit 1 (19/92 failed) and the native geometry command exit 1 (3 failures, led by exact negative-coordinate extent). The checkout was removed afterward.

Serialized cutover: package test:labels and test:geometry now contain the exact reviewed commands; deleted exactly scripts/check-labels.mjs and scripts/check-geometry.mjs. Live inventory passes and reaches every native test exactly once. Focused module command: 7 tests / 135 expects. Focused system command: 5 tests / 211 expects. Package lanes: labels 6 tests / 201 expects; geometry 6 tests / 145 expects. Every ten owner test files passes alone. TASK-130.06 lifecycle lane: 13 tests / 85 expects. Type-check, lint, fmt:check, git diff --check, and the single full bun run check all pass; browser checks ran headlessly and serially inside check only. All authored TypeScript files are 499 lines or fewer. Acceptance criteria intentionally remain unchecked for review.

Fixed-range review remediation against 5c17b31, with base 19c04512 unchanged. Route fixtures no longer export generic Record<string, unknown> data. route-cases.ts now parses each authored rectangle, arrow, text, coordinate, error-string, and captured request fixture through narrow owner-local Zod schemas. Both route owners request unknown JSON and parse acknowledgement, element, board-info, success, or refusal bodies before assertions. A focused negative test rejects a misspelled request type and a response element with a nonnumeric coordinate. No general response helper or production schema was added.

Moved the nine static describe, bounding-box, layout-region, clustering, and selection predicates out of geometry-route.test.ts into geometry-consumers.test.ts. They now run through public runtime/engine roots against typed captured post-transition geometry in geometry-cases.ts. geometry-route.test.ts retains HTTP-dependent remeasurement, rerouting, region query, binding, nudge, restore, and malformed-refusal behavior only.

Rereview worksheet: /tmp/TASK-130.04-assertion-ledger-rereview.tsv, SHA-256 1ddbb89467ed717eb46dd0fd1db20eafa37750e4711d5ffef0886c1a93413f12. It maps 257 predecessor assert calls to 257 native assert calls, unmapped 0, duplicate owner 0, unclaimed 0. It records exact old/new path, line, condition, and assertion text for all rows; four helper-spelling rows are explicitly tagged, and nine pure predicates are tagged moved-pure at geometry-consumers.test.ts lines 63-143. The worksheet remains available for rereview and no parity framework is committed.

Remediation validation: focused malformed-schema proof 1 test/2 expects; geometry-consumers alone 1/22; exact seven-module lane 7/150; exact three-system lane 6/183; label-route alone 2/43; geometry-route alone 2/66; test:labels 7/203; test:geometry 6/130; TASK-130.06 lifecycle lane 13/85; live inventory 11/11. type-check, lint, fmt:check, and git diff --check pass. Prior successful full bun run check and serial headless browser evidence remain applicable; rereview explicitly did not require a rerun. All authored TypeScript files remain <=500 lines, maximum 490. Package mapping, predecessor deletion, production scope, status, assignee, and all six unchecked AC are unchanged.

Second fixed-range remediation against f06e18c, base 19c04512 unchanged. Replaced every authored request object schema in route-cases.ts with z.strictObject, including coordinate, label, binding, metadata/archboard, rectangle/roundness, arrow/start/end, and text shapes. Response schemas retain loose top-level passthrough only where intentional. AcknowledgementRouteResponseSchema now requires success: z.literal(true). No request coercion, passthrough, unsafe cast, production schema, or response framework was added.

The focused negative proof now covers four refusals: misspelled discriminator rectangel, an otherwise valid rectangle carrying unknown key widht, acknowledgement {success:false,error:"no"}, and a response element with string x. It passes 1 test/4 expects.

Regenerated worksheet remains at /tmp/TASK-130.04-assertion-ledger-rereview.tsv with SHA-256 720e7cc5b0ca53445fb6689d7424475275c0d456fd6fcad7da41bbf71816b120. Counts are exactly 244 exact-text, 9 moved-pure, 4 helper-spelling, semantic fallback 0, unmapped 0, unclaimed 0, duplicate owner 0.

Validation: label-route alone 2 tests/45 expects; geometry-route alone 2/66; exact module lane 7/150; exact system lane 6/185; test:labels 7/205; test:geometry 6/130; lifecycle 13/85; inventory 11/11; type-check, lint, fmt:check, and git diff --check pass. The requested prior browser/full-check evidence remains preserved without rerun. route-cases.ts is 337 lines and label-route.test.ts is 226. Package mapping, deletion scope, production scope, task status, assignee, and all six unchecked AC remain unchanged.

Final independent fixed-range rereview is clean on Standards and Spec at 19c04512fd0157aedb9ee90ab44988702c18d53e..f3eb0c837d3ddf0b62b6c87f92a067001971bdfd. The 257-row ledger SHA-256 is 720e7cc5b0ca53445fb6689d7424475275c0d456fd6fcad7da41bbf71816b120: 244 exact-text, 9 moved-pure, 4 helper-spelling, with no unmapped, unclaimed, or duplicate citations. Reconciliation on main passed test:labels (7 tests/205 expects), test:geometry (6/130), the TASK-130.06 lifecycle lane (13/85), live inventory (11/11), type-check, lint, fmt:check, and git diff --check. The earlier complete bun run check passed with browser checks headless and serial; the final test-only schema correction was independently validated without rerunning browsers.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-28 10:59
---
Implementation started at fixed base 19c04512fd0157aedb9ee90ab44988702c18d53e using the already reviewed plan; acceptance criteria remain unchecked pending review.
---

author: @codex
created: 2026-08-28 11:38
---
Implementation and serialized cutover are complete and fully validated. TASK remains In Progress with all acceptance criteria unchecked for independent review.
---

author: @codex
created: 2026-08-28 11:57
---
Applied exactly the two requested review remediations. The fixed-range worksheet is available at /tmp/TASK-130.04-assertion-ledger-rereview.tsv for independent rereview.
---

author: @codex
created: 2026-08-28 12:04
---
Applied the second review finding only: strict authored request schemas, literal-success acknowledgement, and two added negative cases. Updated rereview worksheet is retained in /tmp.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the label and geometry self-running checks with typed module and system tests, strict schema-parsed route fixtures, exact package mappings, and preserved regression parity. Independent fixed-range review was clean; focused lanes, lifecycle, inventory, type, lint, formatting, and diff validation pass, with prior full serial/headless check evidence preserved.
<!-- SECTION:FINAL_SUMMARY:END -->
