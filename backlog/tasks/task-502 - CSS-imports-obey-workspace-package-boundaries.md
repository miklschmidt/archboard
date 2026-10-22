---
id: TASK-502
title: CSS imports obey workspace package boundaries
status: Done
assignee:
  - '@codex'
created_date: '2026-10-22 01:53'
updated_date: '2026-10-22 10:01'
labels: []
dependencies: []
type: chore
ordinal: 909000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The web stylesheet reaches renderer assets through directory-relative paths. TypeScript lint enforces package interfaces, but CSS can reach private files without the same boundary rules. Maintainers need one import contract across authored source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CSS imports and asset URLs use local manifest imports or declared package exports, and lint refuses private package paths, imports of apps, and forbidden area directions.
- [x] #2 The renderer declares the CSS and font assets that the web app consumes, and app.css uses those public names.
- [x] #3 Tailwind source scanning remains explicit and the built stylesheet and emitted font assets remain equivalent.
- [x] #4 Focused boundary regressions and bun run check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing import policy and resolver for parsed CSS references, and connect enforcement to normal lint. 2. Export the renderer assets that the app consumes and migrate CSS import and font paths. Keep Tailwind source globs as filesystem scan inputs. 3. Cover policy failures and valid imports with focused fixtures, compare built CSS and font assets, then run bun run check. No board is affected: the runtime parts and their existing dependencies stay the same.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The native Lightning CSS visitor reads CSS references in recovery mode because Tailwind extends the import syntax. Vite and Tailwind still own compilation. No dependency was added. CSS reuses the TypeScript package resolver and boundary predicates. The package graph now includes CSS and package assets. Focused CSS and graph tests passed (18 tests), and targeted production and test lint passed. The baseline build passed and its CSS and font assets are saved under /tmp/archboard-task502-baseline for comparison.

After the public asset paths changed, the frontend build emitted the same CSS and four font assets as the baseline, with identical names and SHA-256 bytes. The first complete gate found an implicit visitor type, corrected in 51fbda9b6. The second gate reached an unrelated Codex environment observation failure, repaired by TASK-503 in dbf48e9d6. All remaining lanes passed separately: system 257 tests, repository 135 tests, browser all 19 owners. TASK-504 removes measured waits before the final combined gate. The final gate log is /tmp/archboard-task504-check.log.

The pre-push review found one missing native-parser case: image-set candidates do not reach the Url visitor. Commit 1a5d91eef reads these candidates through the Image visitor, so string and url() forms enter the shared policy and package graph. The regression fails before the fix and passes after it, including escaped and prefixed candidates. All 19 focused CSS and graph tests, targeted lint, stylesheet lint, and formatting pass. The final complete bun run check passes on 1a5d91eef in 585.13 seconds. Modules: 4,869 passed and 1 skipped. System: 257 passed. Repository: 136 passed. All 19 browser owners completed with 27 passed tests. Logs: /tmp/archboard-prepush-check.log and /tmp/archboard-prepush-check-timing.json. Standards review found no independent violations. Spec review found this one defect and the reviewer fixed it. The other review scopes found no defects. The final parser callback reuses the existing extraction and policy path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CSS imports and asset URLs now use the TypeScript workspace resolver and boundary rules. Lightning CSS parses the references, with no added dependency. The renderer exports its stylesheet and four fonts, and app.css consumes those names. The package graph includes CSS references and assets.

All five emitted CSS and font files match the baseline names and SHA-256 bytes. Focused policy tests and the complete bun run check gate pass at 510a33d34. The combined gate includes the independent TASK-503 test repair and TASK-504 timing changes.

The pre-push review also closes the image-set asset gap in 1a5d91eef. The complete normal gate passes on that source revision in 585.13 seconds, including all 19 browser owners.
<!-- SECTION:FINAL_SUMMARY:END -->
