---
id: TASK-500.06
title: Vault boards bind the code at its package paths
status: Done
assignee: []
created_date: '2026-10-19 02:53'
updated_date: '2026-10-19 23:11'
labels: []
dependencies:
  - TASK-500.05
parent_task_id: TASK-500
ordinal: 871000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each package move renames the files that .archboard/vault boards bind with binding paths. After timing, diagnostics, process and workspace, bindings such as engine/repo-registry.ts, vault-finder.ts, source-checkout.ts, atomic-write.ts and server/archboard/lib/repositories.ts no longer exist, so the code check reports BINDING_PATH_MISSING for them and the next agent learns a wrong map of the repository. The moves are the architecture change, so the boards must show the packages (archboard-dev: a task adopts a proposal when it closes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every binding in .archboard/vault resolves to a file that exists, and the code check on each board reports no BINDING_PATH_MISSING
- [x] #2 The Archboard board shows the workspace packages and their layers as parts, adopted from a proposal named for this task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map every old src/ path to its package or app path from git (per-commit rename chain, merge-base 97030b56b); directories to the role folder that holds the behavior; barrels to the file that now defines the thing.
2. Rebind every current variant in place (one write per board, claimed, --doing), so the open drafts (TASK-446, TASK-447, TASK-319) follow; remap the drafts' own stale anchors.
3. Re-run archboard check --code until no BINDING_PATH_MISSING or ANCHOR_PATH_MISSING remains; choose role folders by what the check accepts.
4. Archboard@TASK-500.06: Workspace packages container, Layer 0-7 containers, 16 package parts, the direct imports between packages and from the three apps; view 'Workspace packages'; compare, findings diff, footprint against main; adopt.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebinding: current variants were rebound in place, not through proposals, because each open draft (TASK-446/447/319) follows its predecessor and so took the new paths too; a proposal per board would have left them PARENT_SUPERSEDED on stale paths. TASK-446's drafts on Agent workbench and Codex workhorse then held disagreements where they had removed turnInterrupt relationships/steps the rebinding touched; each was settled 'mine' (keeps TASK-446's removal). Historical and shelved variants keep their old paths: the store refuses edits to them.
Code check: BINDING_PATH_MISSING 307 -> 0, ANCHOR_PATH_MISSING 2480 -> 0. Remaining warnings: 8 ANCHOR_SYMBOL_MISSING and 3 ANCHOR_MISMATCH (variantsOf x2, carriedFamily) existed before the move. 79 new ANCHOR_MISMATCH: a module that was one directory now spans role folders (clients/, hooks/, rules/, state/, services/...), and a binding names one path, so an anchor that names a definition in a sibling role folder of the same behavior is outside the bound code (40 on Browser application). Bindings were chosen per node by the role folder that minimised these against the check.
Footprint of Archboard@TASK-500.06 against main: namedAndChanged = Workspace packages and the 16 packages; changedNotNamed = Repository checkout, Codex home, Recorded talks, Clipboard owner, whose files only moved into packages/workspace, codex-app-server, walkthrough and apps/cli (bindings updated, meaning unchanged); proposal introduced no code-check finding (findings identical with and without --variant).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All 17 vault boards bind files and anchors that exist (BINDING_PATH_MISSING 307 to 0, ANCHOR_PATH_MISSING 2,480 to 0) through the archboard CLI, and the Archboard board shows the 16 packages in their layers, the three apps and the 17 direct imports, adopted from Archboard@TASK-500.06 (version 67). Known limit: a binding names one path, and a behavior now spans several role folders, so 79 ANCHOR_MISMATCH warnings are new (Browser application 40); tracked in a follow-up task. bin/archboard check reports 0 diagnostics and bun run check passed.
<!-- SECTION:FINAL_SUMMARY:END -->
