---
id: TASK-436.11
title: Each text line of check --code shows its finding code
status: Done
assignee:
  - '@codex-language'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:35'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 759000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each text line of `check --code` shows the severity, the file, the subject and the message, but not the finding code, such as `RELATIONSHIP_UNDRAWN`. The archboard-dev skill reads the codes from the JSON with `jq`, which no document lists as a requirement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each text line of `check --code` shows its finding code
- [x] #2 The archboard-dev skill compares the findings with and without `--variant` without `jq`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is affected: this changes CLI finding presentation and the development recipe only.
2. Include the finding code beside severity on each main finding line; retain evidence and current stream/exit behavior.
3. Replace the archboard-dev jq comparison with sorted text finding lines, normalizing variant-path prefixes and excluding timings/skips/history.
4. Verify CLI stream structure and finding codes, run recipe-shell syntax and focused skill checks, simplify and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Each main finding line now begins with severity and finding code, while evidence remains beneath it and stream/exit behavior stays unchanged. The archboard-dev comparison reads stderr finding lines through sed and sort, normalizes variants.<id>. path prefixes, and excludes timings/evidence/skips/history without jq. CLI and skill metadata/link owners passed (11 tests); touched production/test lint and bash -n on the extracted recipe passed. No new architecture parts or relationships; smallest resulting product is one formatter change and one replacement recipe. Parent integrates and finalizes.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Text findings include their machine code. The developer skill compares current and proposed findings with shell tools and no jq. Focused output tests, recipe syntax, and the complete gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
