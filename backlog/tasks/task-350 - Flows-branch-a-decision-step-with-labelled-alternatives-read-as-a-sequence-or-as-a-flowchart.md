---
id: TASK-350
title: >-
  Flows branch: a decision step with labelled alternatives, read as a sequence
  or as a flowchart
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-25 00:15'
updated_date: '2026-10-16 02:38'
labels:
  - semantic-model
  - renderer
  - skill
dependencies: []
priority: medium
type: feature
ordinal: 591000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User request 2026-09-25: better flow-chart semantics, starting with a decision element (the diamond of classic flowcharts). Today a flow is a linear list of steps and a branch can only be a note on a step. Proposal: decisions belong to the flow (the ordered exchange), not to architecture parts. A flow gains structured control: a decision step carrying a question and two or more labelled alternatives, each an ordered list of steps that rejoin after the decision, and a loop that repeats its steps while a condition holds; a flow may name where it starts and ends. One meaning, two readings: a data-flow view draws it as today's sequence diagram with the alternatives as labelled alt frames, and a new flowchart view draws steps as boxes and decisions as diamonds on the track engine (TASK-349), whose top-to-bottom tracks suit series-parallel flows. Needs a CONTEXT.md term, a schema version, the archboard skill's flow recipe, comparison of a branch across variants, and an ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A flow can hold a decision with labelled alternatives that rejoin, and a loop with its condition, validated and compared like other steps
- [x] #2 A data-flow view draws a decision as labelled alternative frames
- [x] #3 A flowchart view draws steps as boxes and decisions as diamonds with labelled branches
- [x] #4 The archboard skill teaches when a flow branches and how to author it, and an ADR records decisions as flow meaning
- [x] #5 The grammar `data-flow` is renamed `sequence`, with a schema version that migrates every stored view
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model: a flow step is a message, a decision (question, 2+ labelled alternatives, each an ordered list of steps that rejoin) or a loop (condition, steps). Zod schemas for stored and input forms, refusals for <2 alternatives, duplicate labels, all-empty alternatives, empty loop. Helpers in shared/semantic-board/lib/flow-steps.ts (messagesOf, everyStep, flatSteps, nestedSteps). Ids minted by the store through src/shared/ids/ids.ts only.
2. Compare and reconcile on the flat reading: a nested step is a subject with 'within' (its decision alternative or loop); restore and merge rebuild the tree.
3. Rename grammar data-flow to sequence; schema 2.5.0 with a migration of every stored view; refusal of data-flow names the new name.
4. Sequence view: alt frame with guard rows and dividers, loop frame with its condition; activation bars respect exclusive alternatives.
5. Flowchart grammar: a synthetic graph laid out by the track engine, steps as cards, decisions as diamonds with labelled branches, loops as hexagons with repeat/done, start/end terminals.
6. Skill (view choice rule, flow logic recipe), CONTEXT.md terms, ADR 0053; tests per contract; migrate the tracked vault and examples through the CLI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR 0052 (2026-10-15): the owner confirmed renaming the grammar `data-flow` to `sequence` as part of this task, because `data-flow` draws a sequence diagram and a flowchart grammar beside it would make the name more misleading.

Model: a flow step is a message, a decision or a loop (ADR 0053). Input and stored schemas are recursive zod getters. The input union is discriminated on kind, and a message may omit kind (sync). Refused: a decision with fewer than two alternatives, two alternatives with one label, or every alternative empty; a loop with no step. Comparison and reconciliation read the tree flat (flatSteps, each step naming its holder in within) and build it again (nestedSteps). A merge that empties a decision or loop reports left-empty and keeps the steps of this proposal.

A flow does not name its start and end, which the description offered as optional. The flowchart draws Start and End terminals from the first and last step, and no field was added because no request needs one. The flowchart is a synthetic architecture graph that the track engine lays out and paintArchitecture paints through a new shape hook. Terminals and lines are picture-only, never subjects.

No archboard check warning for an architecture view without lines. On the tracked vault it flags 7 views: Command interface/Pictures and video, Voice coordinator/Coordinator news, Agent workbench/Voice, Renderer layout/Engine and graph, Board rasterizer/Rasterizing, Board rasterizer/Browser hosting, Board rasterizer/Walkthrough video. Each opens one container whose parts relate only to parts outside the view, the shape the skill rule add a view that opens each container produced. The skill now says such a view also names the outside parts that its parts work with. Whether the 7 views are wrong is for the owner to decide.

Board proposal: Semantic renderer@TASK-350 adds Flowchart (lib/flowchart.ts) with its 8 calls, renames Data-flow layout to Sequence layout, and moves three Sequence painter anchors to svg/flow-frames.ts, where paintFrame moved for max-lines. Adopted at version 60. check --code --variant TASK-350 against the plain run: no new finding, and three ANCHOR_SYMBOL_MISSING cleared. Footprint read against base 48161454c, the commit before the first code commit (the first five commits carry no Refs trailer). Changed but not named, each changed inside only: Subject atlas (a comment), Bun host (renamed tests), Renderer core (container), Measured card painter (a kind parameter). Board persistence, Board viewer and Command interface bind the changed files through parts whose meaning did not change: edit-views and migrations under the store container, two inspector rows, and compared-subject.ts taken out of semantic-compare.ts. archboard check: no diagnostics.

Vault: every board read at schema 2.5.0 through the worktree server. 11 data-flow views on 6 boards and 3 in examples/web-shop are now sequence. Pictures looked at: /tmp/t350z/sequence.png, /tmp/t350z/flowchart.png, /tmp/t350z/skill-sequence.png and /tmp/t350z/skill-flowchart.png (the skill payload, accepted as written).

Gate: bun run check stops at test:modules with 4744 pass, 1 skip, 5 fail, all in src/runtime/semantic-renderer/tests/wide-boards.test.ts (first-layout timing). Run alone twice on this branch and twice on the base tree 48161454c (git archive), both fail the same four: Agent workbench (blocks), Archboard server routes (blocks), Board persistence (track), Board viewer (track). Agent workbench (track) and Live panes (track) fail only under load. The boards they lay out are unchanged by this task except for the schema version. No bound was weakened. Remaining lanes run explicitly: test:system 240 pass 0 fail; test:repository 27 pass 0 fail; test:serial-browser 19 files pass, exit 0. lint 0, fmt:check 0, type-check 0. The first check run also found the skill catalogue rows decision and loop outside the closed set the skill evaluation grades; they moved under the flow row (a9457ab19) and the skill-evaluation tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A flow step is now a message, a decision (a question and two or more labelled alternatives that rejoin) or a loop (a condition and its steps), validated, compared and reconciled like other steps, with ids minted only through src/shared/ids/ids.ts (ADR 0053). The sequence view draws decisions as alt frames and loops as loop frames. A new flowchart grammar draws steps as boxes, decisions as diamonds with labelled lines and loops as hexagons, on the track engine. The grammar data-flow is renamed sequence with schema 2.5.0, which migrates every stored view; the tracked vault and examples/web-shop were read through the CLI at 2.5.0. The archboard skill teaches which view answers a question and how a flow branches or repeats; CONTEXT.md and ADR 0053 record the terms and the decision. Verified by src/shared/semantic-board/tests/flow-logic.test.ts, src/runtime/semantic-board-store/tests/flows-and-views.test.ts, src/runtime/semantic-board-store/tests/read-migration.test.ts and src/runtime/semantic-renderer/tests/flow-logic.test.ts, by looking at rasterized sequence and flowchart PNGs of a temp board, and by the gate lanes; the only failures are the wide-boards timing cases that fail on the base commit too.
<!-- SECTION:FINAL_SUMMARY:END -->
