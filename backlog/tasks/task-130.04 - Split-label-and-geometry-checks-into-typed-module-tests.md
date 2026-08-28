---
id: TASK-130.04
title: Split label and geometry checks into typed module tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
updated_date: '2026-08-28 05:05'
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
- [ ] #1 check-labels and check-geometry are replaced by typed native tests grouped by public label conversion, geometry validation, malformed recovery, and route behavior.
- [ ] #2 Every current label binding, ID, normalization, z-order, malformed-geometry, finite-number, and exact-output assertion is represented by a named test through the relevant public interface.
- [ ] #3 Pure tests do not start a server; route tests use the real route boundary and prove the note or board remains unchanged on refusal.
- [ ] #4 Fixtures have explicit types or schema parsing at their input boundary, and no test relies on computed imports that erase module types.
- [ ] #5 Every test file is at most 500 lines and no replacement file receives a complexity, explicit-any, unsafe-assertion, or console exemption.
- [ ] #6 Focused parity checks demonstrate a known label and geometry regression fails both the old and new coverage before the legacy scripts are deleted.
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
