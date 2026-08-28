---
id: TASK-130.03
title: Convert small module checks to typed contract tests
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 01:03'
updated_date: '2026-08-28 05:45'
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
modified_files:
  - src/runtime/engine/tests/library.test.ts
  - src/runtime/engine/tests/text-metrics.test.ts
  - src/runtime/engine/tests/obsidian-note-round-trip.test.ts
  - src/runtime/engine/tests/obsidian-embedded-files.test.ts
  - src/runtime/engine/tests/obsidian-id-stability.test.ts
  - src/runtime/engine/tests/support/obsidian-fixtures.ts
  - src/ui/canvas/tests/change-reporting-state.test.ts
  - src/ui/canvas/tests/change-reporting-acknowledgement.test.ts
  - src/ui/canvas/tests/change-reporting-scheduling.test.ts
  - src/ui/canvas/tests/change-reporting-holds-and-adoption.test.ts
  - src/ui/canvas/tests/support/change-reporting-harness.ts
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

6. Safety correction. Run library.test.ts in its own fresh Bun process. Its top-level boundary assertion must prove libraryFilePath() is the exact path under its owned temporary vault before any read or write. Run text, Obsidian, and reporting in subsequent separate Bun invocations. Never run the prior combined engine command.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Authoring-only native test slice from base 071b56e. No package mapping, legacy deletion, reset export, private product import, shared framework, or production behavior change is included.

Owned files:
- src/runtime/engine/tests/library.test.ts
- src/runtime/engine/tests/text-metrics.test.ts
- src/runtime/engine/tests/obsidian-note-round-trip.test.ts
- src/runtime/engine/tests/obsidian-embedded-files.test.ts
- src/runtime/engine/tests/obsidian-id-stability.test.ts
- src/runtime/engine/tests/support/obsidian-fixtures.ts
- src/ui/canvas/tests/change-reporting-state.test.ts
- src/ui/canvas/tests/change-reporting-acknowledgement.test.ts
- src/ui/canvas/tests/change-reporting-scheduling.test.ts
- src/ui/canvas/tests/change-reporting-holds-and-adoption.test.ts
- src/ui/canvas/tests/support/change-reporting-harness.ts

Positive parity:
- Legacy runners pass unchanged: library 49 checks, text metrics 70 checks, Obsidian Markdown 197 checks, change reporting 116 checks.
- Exact direct native engine lane passes 93 tests with 277 expectations.
- Exact direct native UI lane passes 33 tests with 103 expectations.
- The combined engine command proves the library test works in its required fresh Bun process while other engine tests share that process. ARCHBOARD_VAULT is set before the literal dynamic module-root import and restored afterward.

Disposable negative-control parity:
- Preserving the old library startBinding id: legacy fails "an arrow binding still points at the original id"; native fails the matching startBinding elementId contract.
- Disabling GSUB type-6 chained context: legacy and native each fail office, ffi, ffl at the exact 1.82 px ligature delta plus the ffi ordering check.
- Perturbing the text-plain derived id: legacy and native each fail Koh9JpWT and the settled vault-note id sequence.
- Reading next.deliveryQueued after acknowledgement clears the queue: legacy fails the latest queued delta and aborts on the missing request; native fails both the one-in-flight/latest-queued and 500 ms cadence cases because no follow-up request exists.
The disposable checkout was restored clean and removed.

Authoring validation:
- bun run test:boundaries
- bun run type-check
- bun run lint
- bun run fmt:check
- git diff --check
All pass. Every authored TypeScript file is below 500 lines.

Remaining serialized cutover after TASK-130.02 lands:
1. Rebase this authoring commit onto the TASK-130.02 inventory cutover.
2. Map test:library to bun test src/runtime/engine/tests/library.test.ts.
3. Map test:text to bun test src/runtime/engine/tests/text-metrics.test.ts.
4. Map test:obsidian to bun test src/runtime/engine/tests/obsidian-note-round-trip.test.ts src/runtime/engine/tests/obsidian-embedded-files.test.ts src/runtime/engine/tests/obsidian-id-stability.test.ts.
5. Map test:reporting to bun test src/ui/canvas/tests/change-reporting-state.test.ts src/ui/canvas/tests/change-reporting-acknowledgement.test.ts src/ui/canvas/tests/change-reporting-scheduling.test.ts src/ui/canvas/tests/change-reporting-holds-and-adoption.test.ts.
6. Delete scripts/check-library.mjs, scripts/check-text-metrics.mjs, scripts/check-obsidian-md.mjs, and scripts/check-change-reporting.mjs.
7. Run the two focused native lanes, type-check, lint, fmt:check, the complete sequential bun run check, git diff --check, and TASK-130.02's real-checkout inventory. Confirm each existing package key reaches every new file exactly once and all four predecessor scripts are absent.
Do not check acceptance criteria or move the task out of In Progress until that cutover is integrated and validated.

Safety incident and recovery, 2026-08-28:
- The first combined engine native command imported board.ts from the Obsidian tests before library.test.ts assigned its temporary ARCHBOARD_VAULT. config.ts had already captured the configured user vault, so the library test created and mutated <vault>/.archboard/library.excalidrawlib.
- Work stopped for a read-only audit. The newly created file still had SHA-256 786587d851c3f32b1992c485f3fc33929eede08f5a504dd48fa6e7bdcf7cb000 and was the directory only entry. No task-owned process remained.
- With parent approval, recovery removed that exact file non-recursively and removed the empty .archboard directory with rmdir. Both paths are absent again, restoring the logical pre-test state. The vault-root mtime cannot be restored.
- The earlier note claiming the combined engine command proved fresh-process safety is withdrawn. Do not run that combined command.
- library.test.ts now assigns its owned temporary vault before importing the library module and immediately asserts that libraryFilePath() resolves exactly to <owned-temp>/.archboard/library.excalidrawlib before any read or write.
- Validation now runs library, text, Obsidian, and reporting as separate Bun invocations. The library process passed 10 tests and a post-run check confirmed the configured vault remained absent. Text passed 54 tests, Obsidian passed 29, and reporting passed 33. Type-check, lint, fmt:check, unstaged diff check, and staged diff check pass.
<!-- SECTION:NOTES:END -->
