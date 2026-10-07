---
id: TASK-436.03
title: The live panes move from the Archboard server board to a board of their own
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:16'
labels:
  - dogfood
dependencies: []
parent_task_id: TASK-436
ordinal: 697000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Archboard server board is too large to read, and its first layout takes about 2.1 s on Track and 11 s on Blocks, against a budget of 1 s. Each new relationship made the layout slower, so TASK-367.28 drew 16 dependencies only as steps of flows in three data-flow views. The owner decided to split the board and to show what moves out as cards that drill down to the new board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The parts of the live panes (Pane routes, Pane socket, Pane registry, Board announcements, Change feed, Tab session presence and Disk change watcher) are on a board of their own, and the Archboard server board shows them as one or more cards that drill down to it
- [ ] #2 Each dependency that TASK-367.28 drew only as a flow step is a relationship with an anchor on the board that contains both of its ends
- [ ] #3 The notes give the first layout time of both boards on Track and on Blocks
- [ ] #4 `./bin/dogfood check` reports no diagnostics, and `./bin/dogfood check --code` reports no new warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proposal: Archboard server@TASK-436.03 replaces the seven live pane implementation cards with one Live panes subsystem card; Live panes@TASK-436.03 expands the seven parts and their actual callers and dependencies. The existing code is unchanged.
2. Move the two pane exchanges to Live panes; keep the server write, claim, startup and health exchanges at subsystem grain. All 16 step-only dependencies gain anchored relationships at the board grain that contains their ends.
3. Measure each draft content on Track and Blocks using the vault policy after an unrelated warm-up board; inspect both rendered drawings. Keep every ongoing subject id; the new detail board receives ids from the normal CLI owner, since ids cannot be moved between board families through the authoring contract.
4. Run focused semantic diagnostics and compare code warnings against the current vault. Keep proposals pending source integration and the parent gate; update the vault README scope table.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Draft split: Archboard server has one unbound semantic Live panes subsystem card and the implementation moves to Live panes. This names a real server subsystem spanning seven files without falsely binding it to a single owner file. Existing server subjects keep their ids; new board subjects are minted by the CLI because authoring cannot transfer ids between board families.
First layout with the vault policy after an unrelated warm-up: initial draft Archboard server Track 2032.455 ms, Blocks 8940.166 ms (28 nodes, 84 edges); Live panes Track 288.010 ms, Blocks 180.965 ms (16 nodes, 32 edges). Simplification moved detailed labels at the subsystem boundary into descriptions, leaving them on the detail board: Archboard server Track 1669.427 ms, Blocks 7039.452 ms; Live panes after drawing startup caller and store/lease/listener dependencies Track 392.856 ms, Blocks 194.710 ms (17 nodes, 36 edges). The main board is still above the described 1 s budget; the criterion asks for measured timings, so this is recorded instead of weakening layout checks.
The original 16 flow-only dependency pairs are read from TASK-433 current. At main grain all become relationships with the original anchor, with any live pane end projected onto Live panes; Pane routes to Disk change watcher and Pane registry to Semantic board store are explicit on the detail board. The two pane exchanges move to the detail board. Three real draft code warnings were repaired with existing source-backed startup, listener and store/lease edges. Semantic diagnostics are empty. At this initial checkpoint proposals awaited source integration. Canonical adoption is recorded below; status remains In Progress for the parent gate.

Canonical architecture is now adopted. Archboard server@TASK-436.03 after TASK-436.14 keeps the built browser-origin guard, normal SourceKit indexing and pure historical decoder relationship, replacing the seven pane implementation nodes with one drill-down card. Live panes@TASK-436.03 owns the seven implementations and both pane exchanges. Superseded server drafts are shelved, with no forced adoption. Continuing main-board identities are preserved; newly restated, never-adopted subjects are minted by the CLI. Pane socket calls the shared browser-origin guard on the detail board; at main grain the continuing guard relationship names its bound server-container owner.

All 16 original flow-only pairs were compared against the original TASK-433 content, and each has a relationship with its original source path and symbol on the main or detail board. A final source-anchor audit added the distinct settledChangeFields discard/feed relationship beside announceDoing, rather than treating one projected edge as evidence for both calls. The .03 footprint was read before adoption against base ff3834f198a92303db89f4eed5d603df7359ea5f, with the newly adopted decoder architecture as current/parent. This is a board-only correction to already existing implementations; parts named but unchanged in source are intentional, while concurrent source changes belong to their own task proposals.

Final first native layout, vault policy, one unrelated one-part warm-up, one measured render per board/engine: Archboard server (29 nodes, 89 relationships) Track 2226.037 ms, Blocks 5611.649 ms; Live panes (18 nodes, 39 relationships) Track 310.588 ms, Blocks 253.993 ms. The main board remains above the 1 s target. The Track result stays below the existing 3 s loaded gate bound, which was not changed. All touched drawings on both engines have no routes through cards and no labels off their own runs. The main, detail, viewer and rasterizer Track drawings were inspected at 1920x1080 without manual positioning or clipping repair.

On the final runtime from integrated source HEAD b830345f6, ./bin/dogfood check and ./bin/dogfood check --code both exit 0: zero semantic diagnostics and zero warnings, down from the integrated two-warning baseline. Captures are /tmp/task436-final-check.json and /tmp/task436-final-current-code.json. The named restated .03 proposal check also has zero diagnostics/warnings. No active board claim remains. EXPOSED_UNUSED information grows from 13 to 16 solely because wider existing module bindings are now drawn: Live panes repeats the server root's pre-existing 112 unused names, while .04 adds the two rasterizer/recorder module readings. These board changes add no source exports; the information is not a new unused API from this task.
<!-- SECTION:NOTES:END -->
