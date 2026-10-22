---
id: TASK-501
title: A board node can bind a behavior that spans role folders
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-19 23:11'
updated_date: '2026-10-22 03:49'
labels: []
dependencies: []
ordinal: 908000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Packages and apps put each behavior under several role folders (components, hooks, rules, state, clients), but a node binding names one path. After TASK-500.06 rebound the vault, the code check reports 79 new ANCHOR_MISMATCH warnings, 40 of them on Browser application, because an anchor in another role folder of the same behavior reads as outside both ends. Binding a node to a broad ancestor would quiet them and lose precision. The choice is between letting a binding carry several paths or a glob, and splitting nodes into containers per role.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code check reports no ANCHOR_MISMATCH that comes only from a behavior spread across role folders
- [ ] #2 The binding model change or the board restructure is recorded in an ADR or the domain language, and a test covers the spread case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep bindings singular, as the user clarified. Reject ADR 0056 additionalPaths and shelve Archboard@TASK-501. Preserve the unfinished experiment outside the product branch.
2. Correct current dogfood boards in place because this task changes no product architecture. Use responsibility-based bound children where an existing behavior combines implementation parts. Preserve existing node IDs. Correct wrong anchors and relationships instead of claiming unrelated code.
3. Affected boards from the baseline: Agent workbench, Archboard, Archboard server, Archboard server routes, Board persistence, Board rasterizer, Board viewer, Browser application, Codex session, Codex workhorse, Command dispatch, Command interface, Live panes, Semantic renderer, Voice coordinator. Inspect each mismatch against source.
4. Keep a focused regression for relationship ownership through a child bound to a sibling role folder. Run focused checks, then the complete normal gate once.
5. Compare the final code check against the recorded baseline. Record genuine remaining findings and close only when no mismatch comes solely from role-folder spread.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Baseline at 85daa00fb: archboard check --code completed in 15.055 seconds with 82 ANCHOR_MISMATCH findings, including 40 on Browser application. Outputs: /tmp/archboard-task501-baseline.json and /tmp/archboard-task501-baseline.stderr. The binding also controls code opening, ownership, module exposure, and Git history. A proposed decision in docs/adr/0056-a-binding-keeps-one-open-target-and-can-own-additional-paths.md keeps the primary target and adds explicit additional ownership paths. This is a proposed public model change, pending the plan approval required by the task-execution guide. No implementation or board changes yet.

User approved explicit additionalPaths on 2026-10-22. Archboard@TASK-501 describes complete ownership paths and retains the single code-opening action. Its compare changes code-binding and code-intel responsibilities only.

The user reconsidered additionalPaths because a node spanning distinct modules needs lower-level children. Model implementation stopped. Unfinished code is preserved only on experiment/task501-additional-paths at 69b7978c0, and the product worktree again uses the existing singular schema. Archboard@TASK-501 is shelved. Representative bad anchors include gateway to thread-link citing workhorseLinkKey, and gateway to browser citing diffBrowserSnapshots. These require board repairs rather than expanded ownership.

Board-only correction clears all 82 baseline ANCHOR_MISMATCH findings while keeping singular bindings. The new sibling-role-child regression passes in 0.237 seconds and retains a negative unrelated-anchor assertion. Newly visible EXPOSED_UNUSED information comes from containers now examined by interface analysis. Source inspection and a direct resolver probe show that manifest # imports are not resolved, including the real pane-core -> createPaneReportSender call. That separate analyzer defect is tracked in TASK-505. No exports changed in TASK-501. The Board rasterizer containment warning was corrected by keeping its existing Talk capture peer and addressing that owner in the recording flow. Structural archboard check now exits 0 with no diagnostics.

Final code-check comparison: 82 ANCHOR_MISMATCH findings become zero. All eight ANCHOR_SYMBOL_MISSING identities match the baseline, with none added. Structural diagnostics are empty. The 16 newly visible EXPOSED_UNUSED identities are information findings from existing exports now inspected through containers, not new exports; the unresolved manifest-import defect is documented in TASK-505 pending the requested approval to retain that follow-up. Browser application and Semantic renderer overviews were rasterized and inspected. The extra wide Application owners view was removed during simplification because the existing focused views and root overview already serve those readings. Product source, schemas, runtime readers, consumer skill and evaluation inputs are unchanged from 85daa00fb. Only the focused regression was added outside the board and decision records. No active model proposal remains to adopt; current boards were corrected against unchanged code.

The complete normal gate failed after 253.50 seconds at the module lane: 4,859 pass, 1 skip, 2 fail. The new board detail exposes renderer clearance defects on Agent workbench (Track) and Browser application (Blocks). The exact geometry reproduces outside the duration assertion. TASK-506 records the mandatory gate repair under the archboard-dev completion workflow. Remaining normal lanes are running separately so the early module failure hides none. TASK-501 stays In Progress until the repair and complete gate pass.

TASK-505 is now implemented as 6964cd0fa. Its source-backed board corrections retain singular ownership, narrow the raster session and visual workbench paths, and draw architectural calls now resolved through manifests. The live code pass still has zero ANCHOR_MISMATCH and no structural diagnostics. Newly resolved utility or data-node calls outside the board questions remain visible with scope explanations in TASK-505 notes. TASK-506 fixes the required renderer failures and remains under validation. The prior remaining-lane run passed system (257), repository (135), and all 19 browser owners. A complete gate is still required after all repairs. README freshness already failed for all 16 assets at baseline 85daa00fb, as proved by /tmp/archboard-task501-readme-baseline.json, so this task does not regenerate unrelated stale media.
<!-- SECTION:NOTES:END -->
