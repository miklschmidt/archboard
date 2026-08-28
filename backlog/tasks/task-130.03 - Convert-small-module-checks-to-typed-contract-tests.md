---
id: TASK-130.03
title: Convert small module checks to typed contract tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
updated_date: '2026-08-28 05:04'
labels: []
dependencies:
  - TASK-130.01
references:
  - scripts/check-library.mjs
  - scripts/check-text-metrics.mjs
  - scripts/check-obsidian-md.mjs
  - scripts/check-change-reporting.mjs
  - docs/design/measuring-text-outside-a-browser.md
  - docs/design/server-is-the-truth.md
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the focused library, text measurement, Obsidian Markdown, and change-reporting checks into the modules whose public contracts they exercise. These are the lowest-risk proving ground for typed fixtures, named bun:test assertions, and the 500-line test limit.

The conversion must delete local failure counters and process exits. Tests should fail at the specific contract instead of printing one aggregate summary after hundreds of statements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-library, check-text-metrics, check-obsidian-md, and check-change-reporting are replaced by co-located typed Bun tests that import only module-root entrypoints.
- [ ] #2 Text metrics retain their measured tolerances and fixtures; Obsidian Markdown retains the four historical ID rename golden values and exact serialized bytes.
- [ ] #3 Change-reporting tests preserve source tagging, human-edit ordering, held/released behavior, and every currently asserted reachable state.
- [ ] #4 Each test file is at most 500 lines, test names identify one observable contract, and shared setup reduces duplicated mechanics without hiding expected values.
- [ ] #5 The old scripts fail when run against an intentionally broken focused fixture before deletion, and the replacement native tests fail on the same behavior.
- [ ] #6 The focused native lane plus bun run type-check, bun run lint, and bun run fmt:check pass after the legacy scripts are removed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependency and ownership. Rebase after TASK-130.01 and integrate only after TASK-130.02 has landed its real-checkout inventory. Use the strict root type check, module-local test owner, module-root imports, same-owner support, and 500-line limit unchanged. This task owns the serialized package mapping and deletion for its four predecessors. TASK-130.11 later consolidates final lane names and layout and removes remaining non-check MJS. It does not delete these checks.

2. Exact legacy-to-native mapping and ownership.
Module-owned by src/runtime/engine:
- scripts/check-library.mjs -> src/runtime/engine/tests/library.test.ts.
- scripts/check-text-metrics.mjs -> src/runtime/engine/tests/text-metrics.test.ts.
- scripts/check-obsidian-md.mjs -> src/runtime/engine/tests/obsidian-note-round-trip.test.ts, obsidian-embedded-files.test.ts, and obsidian-id-stability.test.ts.
- src/runtime/engine/tests/support/obsidian-fixtures.ts is same-owner typed fixture data for scenes, note sections, and exact expected bytes. Expected serialized strings and four historical IDs remain visible in tests.
Module-owned by src/ui/canvas:
- scripts/check-change-reporting.mjs -> src/ui/canvas/tests/change-reporting-state.test.ts, change-reporting-acknowledgement.test.ts, change-reporting-scheduling.test.ts, and change-reporting-holds-and-adoption.test.ts.
- src/ui/canvas/tests/support/change-reporting-harness.ts is same-owner setup for the fake clock, scene adapter, request recorder, and deterministic delivery. It contains mechanics only. Event order, request bodies, timing values, and reachable states stay in named tests.
There are no tests/system files in this task.

3. Contracts under 500 lines. library.test.ts preserves v1 and v2 parsing, seven sets and 111 stencils, deterministic IDs and status, one-time and later-set seeding, deletion persistence, attribution, selection refusals, fresh ID and binding remaps, position, groups, customData, and input immutability. Set ARCHBOARD_VAULT before a literal typed module-root import, use a unique vault, restore environment and files, and let the focused Bun process discard kept state. Do not add a reset export or private import. text-metrics.test.ts preserves every browser-captured width, font face count and range, ligature and context case, the 0.002 general and 0.01 Virgil tolerances, 0.5 rounding comparisons, and the 2,000-call warm-cache budget.

obsidian-note-round-trip.test.ts owns fresh, prose, frontmatter, banner, plugin-heading, idempotence, and exact whole-note bytes. obsidian-embedded-files.test.ts owns current and legacy records, exact carry-through, Element Links removal, resolved, missing, ambiguous, local, HTTP, equation, and duplicate-record cases. obsidian-id-stability.test.ts owns the server-board alphabet and length, collisions, four rename goldens, stable block references, and exact bytes. The four change-reporting tests preserve the exact public exports, source tags, human ordering, acknowledgements, per-ID freshness, one in-flight plus one queued delivery, progress and idle timing, held and released states, retries, adoption, overlapping server updates, and text ID normalization.

4. Parity and serialized cutover. Native files may be authored in parallel only because their paths are disjoint. In a disposable checkout, prove old and new coverage fail for the same focused regressions: preserve an old library binding ID, perturb a measured ligature path, alter an Obsidian derived ID or serialized byte, and let an accepted report discard a queued edit. Once parity is recorded, the reconciliation owner performs one serialized integration:
- Map package.json test:library to bun test src/runtime/engine/tests/library.test.ts.
- Map test:text to bun test src/runtime/engine/tests/text-metrics.test.ts.
- Map test:obsidian to bun test src/runtime/engine/tests/obsidian-note-round-trip.test.ts src/runtime/engine/tests/obsidian-embedded-files.test.ts src/runtime/engine/tests/obsidian-id-stability.test.ts.
- Map test:reporting to bun test src/ui/canvas/tests/change-reporting-state.test.ts src/ui/canvas/tests/change-reporting-acknowledgement.test.ts src/ui/canvas/tests/change-reporting-scheduling.test.ts src/ui/canvas/tests/change-reporting-holds-and-adoption.test.ts.
- Delete scripts/check-library.mjs, scripts/check-text-metrics.mjs, scripts/check-obsidian-md.mjs, and scripts/check-change-reporting.mjs.
Do not land native tests before this mapping and deletion cutover. TASK-130.02 inventory must remain green through the integration.

5. Validation. Run:
bun test src/runtime/engine/tests/library.test.ts src/runtime/engine/tests/text-metrics.test.ts src/runtime/engine/tests/obsidian-note-round-trip.test.ts src/runtime/engine/tests/obsidian-embedded-files.test.ts src/runtime/engine/tests/obsidian-id-stability.test.ts
bun test src/ui/canvas/tests/change-reporting-state.test.ts src/ui/canvas/tests/change-reporting-acknowledgement.test.ts src/ui/canvas/tests/change-reporting-scheduling.test.ts src/ui/canvas/tests/change-reporting-holds-and-adoption.test.ts
Then run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially after integration. Do not run broad validation in parallel. Acceptance requires the existing package keys to reach every new file exactly once, all four predecessor scripts to be absent, and the real inventory to pass.
<!-- SECTION:PLAN:END -->
