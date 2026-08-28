---
id: TASK-130.05
title: Decompose board inspection into native contract and package tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
updated_date: '2026-08-28 06:13'
labels: []
dependencies:
  - TASK-130.01
  - TASK-130.04
references:
  - scripts/check-board-inspection.mjs
  - src/runtime/board-inspection
  - docs/agents/test-suite.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-board-inspection is 7,752 lines and combines pure snapshot safety, detector behavior, complexity ceilings, diagnostics, rendering inputs, bridge validation, package execution, CLI output, and mutation audits. It is the largest file in the repository and the main reason this migration cannot be a rename.

Split the coverage along the existing board-inspection entrypoints. Preserve authored fixtures and exact limit cases, but move each contract into a test file small enough to understand and schedule independently.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-board-inspection is replaced by typed native tests for input snapshotting, schemas, detectors, architecture facts, bridge validation, diagnostic counters, complexity ceilings, package execution, CLI output, and read-only behavior.
- [ ] #2 Tests preserve the exact 1,000,000 input-unit and 2,000,000 comparison ceilings, the 1,516,200 below-limit comparison count, deterministic finding order, strict and non-strict exits, and completed findings at the comparison stop.
- [ ] #3 Proxy, revoked-proxy, accessor, cycle, custom-prototype, sparse-array, unsafe-scalar, and large supported input cases prove the public inspector does not execute caller-owned JavaScript or mutate input.
- [ ] #4 Bridge schema-v2 cases preserve provenance validation, exact crossing suppression, unchanged architecture, compare and describe bytes, and the renderer-facing focus contract.
- [ ] #5 Package tests invoke the shipped binary with no canvas process, prove zero HTTP contacts and unchanged vault paths, bytes, and mtimes, and validate stdout through the exported schemas.
- [ ] #6 Diagnostic counters remain test-only noncontractual evidence and never enter product output.
- [ ] #7 Every test file is at most 500 lines, imports public entrypoints, and can run independently with deterministic cleanup and no shared mutable fixture state.
- [ ] #8 A focused parity matrix proves the native tests catch representative snapshot, detector, limit, bridge, CLI, and mutation regressions before the legacy script is deleted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependencies, behavior boundary, and ownership. Rebase after TASK-130.01 and TASK-130.04, and integrate only after TASK-130.02 has made the real-checkout inventory live. This is a coverage migration only: import the public src/runtime/board-inspection entrypoints index.ts, diagnostics.ts, architecture.ts, and bridge.ts; the public src/cli/commands/bridge.ts entrypoint; and the public root entrypoints of compare, board, board-io, geometry, labels, apply-element-input, and describe. Do not deep-import lib, alter an inspector limit, change product output, or implement TASK-129. Rounded, elbowed, and fixed-segment connectors retain the reviewed rounded-or-elbowed unsupported result in this task; TASK-129 remains the separate product change after native inspection coverage. TASK-130.11 owns final lane-name consolidation and final suite documentation, not this predecessor deletion.

2. Exact module-owned mapping under src/runtime/board-inspection/tests, with one exclusive contract group per file:
- schema-and-format.test.ts owns schema-v2 public fields, fixed code/reason severity and coverage combinations, policy normalization and rejection, exhaustive formatter coverage, and the absence of diagnostic counters from product reports.
- bridge-create.test.ts owns proper-crossing selection, exact two-part role order, strict normalized metadata, inclusive 0.5 --at selection, just-outside refusal, exact create receipts parsed through BridgeResultSchema from the public src/cli/commands/bridge.ts entrypoint, bounded identical-source refusal, and deterministic repeat planning.
- bridge-validation.test.ts owns valid, incomplete, stale, deleted, wrong-type, extra-field, duplicate, interposed, and semantic-field bridge provenance; exact one-crossing suppression; safe removal and exact removal receipts parsed through BridgeRemoveResultSchema from the public src/cli/commands/bridge.ts entrypoint; architecture/compare/describe invisibility; and unchanged compare bytes.
- input-snapshot.test.ts owns proxy, revoked-proxy, accessor, cycle, custom-prototype, unsafe-scalar, sparse and holed arrays, frozen input, report-copy isolation, and caller-code/non-mutation proofs.
- record-decoding.test.ts owns invalid identities, malformed scalar and record shapes, render prerequisites, path and binding decoding, source indices, locatable evidence, and schema-total refusals.
- unrepresentable-geometry.test.ts owns finite overflow, absolute/path/aggregate spans, affected and focus boxes, exact 16-pixel focus padding, missing-delta evidence, rotation, malformed-angle, curve, curveKind, roundness, true-or-malformed-elbowed, and fixedSegments cases, the exact UNSUPPORTED_GEOMETRY reason=rounded-or-elbowed, and suppression of downstream penetration, obstacle, crossing, and bridge analysis when those prerequisites are unsupported.
- binding-classification.test.ts owns forward/reverse binding and boundElements classification, reciprocal and target-type cases, duplicate identities, container ownership, the existing 80-case totality matrix, and suppression of false downstream findings.
- labels-fonts-and-tolerances.test.ts owns persisted font policy, duplicate and orphan labels, missing reciprocals, conflicting owners, placement/drift semantics, createdAt keeper choice, and exact 0.5 dimension, intersection-endpoint, and overlap boundary cases with their just-inside/outside controls.
- hierarchy-and-overlap.test.ts owns finite and extreme containment, stable parent tie-breaking, leaf and ancestor exclusions, nested zones, unrelated label overlap, aggregate cross-product gating, and exact UTF-16 hierarchy identity order.
- obstacle-classification.test.ts owns singleton and transitive library/group obstacles, canonical escaping and attribution evidence, non-obstacle exclusions, endpoint and ancestor exclusions, promoted multipart nodes, and deterministic obstacle identity.
- completion-contract.test.ts owns the byte-identical dense before/after fixtures, whole-board reroute, preservation of grouped/stencil/decoration records, exact dense compare JSON bytes, semantic identity, and the inspection completion eval link.
- comparison-limits.test.ts owns the exact 1,516,200 below-limit comparison count, the 2,000,001 attempted comparison stop, completed pre-stop findings, terminal-limit precedence, participating evidence, and 2,000,000 ceiling schema.
- input-limits.test.ts owns acceptance at exactly 1,000,000 input units, refusal at 1,000,001, long identities, point arrays, bulk arrays, deterministic limit bytes, and zero semantic work after an input stop.
- sweep-filtering.test.ts owns zero-segment, same-connector, endpoint, same-owner label, ancestor, partial-complement, boundary, and best-parent prefilters with exact eligible pair sets.
- sweep-ordering.test.ts owns control characters, prefixes, lone surrogates, stable input-reversal order, brute-force one- and two-sided sweep oracles, exact-union expiry/reinsertion, same-set uniqueness, and coarse diagnostic peaks.
- large-input-indexes.test.ts owns large boundElements, rejected groups, group classification, label membership and repair indexing, pair identity injection, reverse ownership, hierarchy inventory, aggregate failure, obstacle attribution, and multi-point finding finalization.
No contract appears in two files. The diagnostics entrypoint remains test-only evidence, not a product contract.

3. Module-owned fixture and support mapping. Move scripts/fixtures/board-inspection/dense-before.excalidraw.json, dense-after.excalidraw.json, and dense-compare.json byte-for-byte to src/runtime/board-inspection/tests/fixtures with the same basenames; compare raw bytes and SHA-256 before deleting the old copies. Add only typed fixture data at src/runtime/board-inspection/tests/fixtures/elements.ts, limit-cases.ts, and sweep-cases.ts. These files own raw record builders and deterministic board generators, not assertions, expected findings, limits, or an alternate inspector. Keep exact expected values in the owning tests. No shared mutable fixture state.

4. Exact tests/system-owned mapping under tests/system/board-inspection:
- package-json.test.ts owns no-canvas package execution, CheckResultSchema validation, clean and malformed reports, persisted ordering, duplicate-label selection, group applicability, and JSON stdout.
- package-bridge.test.ts owns persisted valid, incomplete, stale, deleted, wrong-type, semantic-field, and interposed bridge cases with exact suppression and strict exits, parses package inspection output through CheckResultSchema, and parses exact create/removal receipt fixtures through BridgeResultSchema and BridgeRemoveResultSchema from the public src/cli/commands/bridge.ts entrypoint.
- package-limits.test.ts owns persisted input and comparison ceilings, completed findings at the stop, exhaustive text bytes, and strict/non-strict equality.
- package-totality.test.ts owns persisted invalid identities, malformed target types, overflow number input, prerequisite gating, focus/affected evidence, control escaping, label-pair injection, obstacle identity reversal, and persisted rounded, elbowed, and fixed-segment schema-total reports with the exact UNSUPPORTED_GEOMETRY reason=rounded-or-elbowed and downstream suppression.
- package-text-and-exits.test.ts owns formatInspectionText byte equality, fixed-base blank-token coercion, warning/error/indeterminate exits 6/7/8, usage exit 2, operational exit 1, stdout/stderr placement, and invalid-policy precedence.
- package-read-only.test.ts owns zero HTTP contacts, no canvas autostart, unchanged vault paths/bytes/mtimes, no lock/claim/open/save/repair/rewrite/id-mint side effect, and strict normal ingest.
Add tests/system/board-inspection/support/package-inspection.ts for typed bin resolution, note writing, process result capture, HTTP sentinel ownership, vault byte/mtime snapshots, and deterministic cleanup. Add fixtures/package-cases.ts and fixtures/package-limit-cases.ts for schema-typed scene inputs only. Expected bytes, statuses, order, and side-effect assertions stay in the six owning tests. There is no canvas lifecycle helper or general test framework here.

5. Physical-line and type discipline. Every authored .ts test, support, and fixture named above stays at or below 500 physical lines and is enforced by TASK-130.01. JSON goldens remain authored fixture data. All raw records cross the public schemas or explicit local fixture types. Module tests import only public module-root entrypoints; package tests invoke bin.archboard from package.json and never handlers. Do not extract an assertion DSL, alternate decoder, or shared expected-value table merely to meet the line limit.

6. Red and parity proof before deletion. Keep scripts/check-board-inspection.mjs and the old fixture paths while native tests are authored. In disposable checkouts, run old and new against representative deliberate regressions: invoke one caller accessor, reverse exact finding order, change the 0.5 boundary, move either 1,000,000 or 2,000,000 ceiling, discard a completed finding at comparison stop, accept stale bridge provenance, change a bridge receipt schema, treat rounded/elbowed/fixed-segment input as supported, change dense compare bytes, make the package contact the sentinel, and mutate a vault mtime. Record that the relevant native group and legacy script both fail, while diagnostic-only counter changes do not alter public JSON. Prove all three fixture old/new byte and SHA-256 pairs match before cutover. Do not update expectations to admit a regression.

7. Serialized package, eval, and deletion cutover. After parity, the reconciliation owner performs one integration:
- Map package.json test:inspection exactly to bun test src/runtime/board-inspection/tests/schema-and-format.test.ts src/runtime/board-inspection/tests/bridge-create.test.ts src/runtime/board-inspection/tests/bridge-validation.test.ts src/runtime/board-inspection/tests/input-snapshot.test.ts src/runtime/board-inspection/tests/record-decoding.test.ts src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts src/runtime/board-inspection/tests/binding-classification.test.ts src/runtime/board-inspection/tests/labels-fonts-and-tolerances.test.ts src/runtime/board-inspection/tests/hierarchy-and-overlap.test.ts src/runtime/board-inspection/tests/obstacle-classification.test.ts src/runtime/board-inspection/tests/completion-contract.test.ts src/runtime/board-inspection/tests/comparison-limits.test.ts src/runtime/board-inspection/tests/input-limits.test.ts src/runtime/board-inspection/tests/sweep-filtering.test.ts src/runtime/board-inspection/tests/sweep-ordering.test.ts src/runtime/board-inspection/tests/large-input-indexes.test.ts tests/system/board-inspection/package-json.test.ts tests/system/board-inspection/package-bridge.test.ts tests/system/board-inspection/package-limits.test.ts tests/system/board-inspection/package-totality.test.ts tests/system/board-inspection/package-text-and-exits.test.ts tests/system/board-inspection/package-read-only.test.ts.
- Update skills/archboard/evals/evals.json in the same integration: replace the inspection grader and inspection file references with src/runtime/board-inspection/tests/completion-contract.test.ts, update the grading prose from check script to native test, and leave branch-compare and side-by-side references for TASK-130.08.
- Delete scripts/check-board-inspection.mjs and the three superseded scripts/fixtures/board-inspection JSON paths.
Do not land native tests or moved fixture ownership before this mapping/deletion/eval cutover. TASK-130.02 inventory must pass with every native path reached exactly once. TASK-130.11 later folds test:inspection into the final module/system lane layout; it does not delete this predecessor.

8. Exact focused validation. Run:
bun test src/runtime/board-inspection/tests/schema-and-format.test.ts src/runtime/board-inspection/tests/bridge-create.test.ts src/runtime/board-inspection/tests/bridge-validation.test.ts src/runtime/board-inspection/tests/input-snapshot.test.ts src/runtime/board-inspection/tests/record-decoding.test.ts src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts src/runtime/board-inspection/tests/binding-classification.test.ts src/runtime/board-inspection/tests/labels-fonts-and-tolerances.test.ts src/runtime/board-inspection/tests/hierarchy-and-overlap.test.ts src/runtime/board-inspection/tests/obstacle-classification.test.ts src/runtime/board-inspection/tests/completion-contract.test.ts src/runtime/board-inspection/tests/comparison-limits.test.ts src/runtime/board-inspection/tests/input-limits.test.ts src/runtime/board-inspection/tests/sweep-filtering.test.ts src/runtime/board-inspection/tests/sweep-ordering.test.ts src/runtime/board-inspection/tests/large-input-indexes.test.ts
bun test tests/system/board-inspection/package-json.test.ts tests/system/board-inspection/package-bridge.test.ts tests/system/board-inspection/package-limits.test.ts tests/system/board-inspection/package-totality.test.ts tests/system/board-inspection/package-text-and-exits.test.ts tests/system/board-inspection/package-read-only.test.ts
Then run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. The eventual lane categories are module for src/runtime/board-inspection/tests and system for tests/system/board-inspection; TASK-130.11 owns their final package names.

9. Overlap and integration boundary. Native files are disjoint from TASK-130.08/.09/.10 and may be authored in parallel after their dependencies. package.json is shared by every predecessor and is always reconciled one task at a time. skills/archboard/evals/evals.json is also shared with TASK-130.08: integrate this task first, then let TASK-130.08 replace only the remaining branch and side-by-side paths. Do not run the source-mutating hot-reload coverage from TASK-130.08 while this task validates. Required serialized order at this seam is TASK-130.04, TASK-130.05, then TASK-129 only as a separate later product task under its existing TASK-130 dependency.
<!-- SECTION:PLAN:END -->
