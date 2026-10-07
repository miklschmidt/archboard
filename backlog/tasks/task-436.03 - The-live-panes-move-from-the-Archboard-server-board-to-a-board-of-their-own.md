---
id: TASK-436.03
title: The live panes move from the Archboard server board to a board of their own
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 00:55'
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
The original 16 flow-only dependency pairs are read from TASK-433 current. At main grain all become relationships with the original anchor, with any live pane end projected onto Live panes; Pane routes to Disk change watcher and Pane registry to Semantic board store are explicit on the detail board. The two pane exchanges move to the detail board. Three real draft code warnings were repaired with existing source-backed startup, listener and store/lease edges. Semantic diagnostics are empty. Proposals remain unadopted until source integration and the parent gate.
<!-- SECTION:NOTES:END -->
