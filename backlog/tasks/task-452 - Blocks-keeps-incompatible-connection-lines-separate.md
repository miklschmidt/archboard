---
id: TASK-452
title: Blocks keeps incompatible connection lines separate
status: Done
assignee:
  - '@codex'
created_date: '2026-10-09 10:33'
updated_date: '2026-10-09 10:59'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 803000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers see Blocks join lines with different relationship kinds or traffic directions. Preserve each connection meaning when routes share a corridor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Different relationship kinds remain distinct along rendered Blocks routes.
- [x] #2 Connections with incompatible traffic directions do not join along rendered Blocks routes.
- [x] #3 Compatible connections can still share a line, and focused regression tests exercise the reported failure.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use the reported Auditlog Timestamp Integrity board to reproduce the overlap. Keep an anonymized renderer fixture and test both different-kind and same-kind opposing routes. Separate unrelated facing port columns during existing port settlement, within the allowed span, while retaining directly connected and shared ports. Run renderer tests, the complete repository gate, and the live board. No board proposal is needed: Renderer layout and Semantic renderer retain the same parts, calls, and responsibilities; the change stays inside port settlement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduction: EF Core read and GET auditlog endpoints share 10 diagram units on the reported board. The reduced fixture shares 24.25 units, for both http/data and data/data. The native trunk router fixes the end segments. Nudging them also moves their pins, so the fix separates unrelated facing ports before routing. The existing nearestFree span calculation selects a column inside the allowed span. All 544 renderer tests passed before the helper extraction; the 13 focused tests passed after it. Existing kind tests retain compatible shared ports. The renderer promise and authoring contract stay unchanged, so consumer skill and evaluation inputs need no change.

Live validation: restarted the existing server on port 3100 with its original vault and reloaded the reported browser tab. The HTTP route and EF Core read route now remain separate. The original full-board SVG probe reports zero overlap. Simplification: removed the attempted route-repair path and reused port settlement plus nearestFree instead. The extracted port-columns helper owns both existing same-edge spreading and facing-port separation.

Architecture close: dogfood check --code exits 1 for an existing ANCHOR_SYMBOL_MISSING on Board rasterizer (drawRequest in src/cli/commands/semantic-rasterize.ts). No finding names settle.ts or port-columns.ts. Commit a0ef00bde makes Renderer layout / Renderer core and Semantic renderer / Renderer core plus Bun host appear behind. Those parts still describe the same responsibilities and boundaries. Bun host changed only through its renderer regression fixture and test.

Final validation: bun run check exits 0. The module lane passes 4,433 tests with one skipped test. System passes 197 tests, repository passes 24 tests, and all 19 browser test files pass. The live board and reduced regressions both show separate incompatible routes. Logs: /tmp/blocks-check-final.log and /tmp/blocks-renderer-tests.log.

Pre-push review: Standards and settlement integration reviews found no issues. The Spec reviewer added assertions that both reported routes remain drawn, committed as 6fe821012. All 13 focused tests and focused lint and formatting pass after that test-only change. No production code changed after the complete gate. README assets architecture and git-history were refreshed. The tracked images are byte-identical, and the two source hashes now match. The new git-history clip was inspected and attached. The other 14 stale assets predate this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blocks now separates unrelated facing ports before routing. The reported different-kind and opposing-direction lines stay distinct, while compatible connections retain shared ports. Both routes remain present in regression tests. The live board, 13 focused tests, and complete bun run check gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
