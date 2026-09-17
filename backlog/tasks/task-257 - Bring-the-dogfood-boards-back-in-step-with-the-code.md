---
id: TASK-257
title: Bring the dogfood boards back in step with the code
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 18:09'
updated_date: '2026-09-17 21:25'
labels: []
dependencies:
  - TASK-255
references:
  - .archboard/README.md
  - TASK-255
  - TASK-254
ordinal: 463000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracked .archboard/vault has not been touched since commit b2e15022 on 2026-09-13, and 141 commits have landed since. It holds 11 boards for a source tree of 92 modules, and the drift is already measurable: 9 of its 89 code bindings point at files that no longer exist, all of them from the renderer's move out of src/runtime/semantic-renderer/lib into src/transformers (architecture.ts, dataflow.ts, edges.ts, regions.ts, svg/architecture.ts, svg/cards.ts, svg/document.ts, text.ts, theme.ts). Whole subsystems built since — the skill evaluation harness, the Codex workhorse and coordinator family, the rasterizer — have no board at all, while `Archboard` still draws the system as it stood in September.

This is the repo's own dogfood: .archboard/README.md tells an agent to start at `Archboard` with ./bin/dogfood, and every board it reads there is stale enough to mislead. It is also the place the skill's worked examples now come from (TASK-254), so a board that lies about the code makes the skill lie with it.

Two things to decide while doing it, not before: how much of a 92-module tree a system board should carry before it drills down, and whether a binding whose path has left the repo should be a checker diagnostic rather than something a person notices a year later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every code binding in .archboard/vault names a path that exists in this repository
- [x] #2 The boards describe the system as it now stands, including the subsystems built since 2026-09-13 that no board covers
- [x] #3 A reader starting at `Archboard` with ./bin/dogfood can reach every board through the drill-down links, and no link opens a board the vault does not hold
- [x] #4 The boards were authored through the archboard CLI, not by editing vault files
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the drift: which bindings name paths that are gone, which drill-downs the ADR 0029 checker rejects, which subsystems have no board (done: 22 stale binding paths across variants, 26 DRILL_DOWN_LEVEL_MISMATCH, 2 DRILL_DOWN_ONLY_NODE).
2. Give the vault vocabulary a 'system' node kind in .archboard/vault/.archboard/config.yaml, so a board can carry the kind ADR 0029 requires of a node opening the system board.
3. Gather source evidence for every board to be written: the renderer's move into src/transformers, the rasterizer, the skill-evaluation harness, the Codex workhorse and coordinator family, and the current CLI/server/browser module trees.
4. Rewrite the existing eleven boards through the archboard CLI, one claimed board at a time: rebind every node to the file that implements it today, delete the link-only cards ADR 0029 calls buttons, draw the real caller in their place or move the upward link onto the container the board describes, and give every drill-down-carrying node the kind of the board it opens.
5. Author the boards the vault lacks: the skill evaluation harness, the Codex workhorse, the voice coordinator and the board rasterizer, each linked from the board one level up.
6. Re-record the per-board scorecards in src/runtime/semantic-renderer/tests/wide-boards.test.ts, rasterize every board and read the pictures before recording.
7. Bring .archboard/README.md's board table back in step, run ./bin/dogfood check to zero warnings, and record the two decisions the task asks for in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Decision: how much of a 92-module tree a system board carries

A system board carries one node per thing that runs or persists on a machine — one per OS process, one per durable store — and drills down at the first module boundary. Not a fraction of the module tree, and not a number that grows with it: at system level the reader's question is 'what is running and what does it keep', and 92 modules answer a different question. `Archboard` is eight nodes (agent CLI, canvas server, browser, the Codex child, the headless browser a picture is taken in, the skill-evaluation harness, the vault, the checkout) and would still be about eight if the tree doubled.

The level below takes the weight: a service board carries the modules of one running thing, which is 9 to 16 cards here, and anything denser gets a module board of its own. That is where the four new boards came from.

## Decision: a binding whose path has left the repo

It should be a checker diagnostic, and it must skip historical variants.

Measured today: 222 bindings across every variant of the vault; 5 name paths that no longer exist, all five on `Renderer layout`'s historical `Initial`. The store refuses to edit a historical variant on purpose — 'what was true then does not change' — so a binding that pointed at a file which existed then is a correct record, not drift. A check that flagged it would be unfixable noise, and the one thing it must not do is push anyone toward rebinding history to today's files, which would make the record lie.

Proposed as follow-up (NOT implemented here, outside this task's criteria): a `BINDING_PATH_MISSING` warning in the vault checker beside the ADR 0029 drill-down diagnostics, over current and draft variants only, reported per node with the path it names. It belongs in the checker rather than at the write boundary for the same reason the drill-down checks do: the answer depends on a filesystem the board does not own and goes stale on its own.

Two more follow-ups worth filing:
- The same historical exemption is missing from the drill-down checker. `./bin/dogfood check` is at exactly one warning now, and it is `Renderer layout`/`Initial`'s `Render driver`, of kind `function`, opening a `module` board. It cannot be repaired by any write the store will accept.
- There is no way to retire a variant. `Canvas server` still carries a draft named `Readable layout` that proposes nothing (it was a renderer layout-comparison fixture); `Semantic renderer`'s draft of the same name has been settled into agreement with its parent because the proposal has since been implemented. Adopting either would freeze an accurate current variant into unmaintainable history, so both were left as drafts.

## What changed

Vocabulary: `.archboard/vault/.archboard/config.yaml` gained a `system` node kind (ADR 0029 wants a kind per level) and lost `app`, which no board uses now.

Eleven boards rewritten through the CLI, four new ones authored; fifteen in the vault:
- `Archboard` — processes and stores; gained the skill-evaluation harness and the headless browser a picture is taken in. The Codex app-server lost its drill-down: it is third-party, and the board it opened describes archboard's own integration, which `Canvas server` now links to instead.
- `Canvas server` — the write boundary and the claim routes drawn for the first time; `Mutation admission` rebound off `application-lifetime.ts` onto `mutation-admission.ts`, which is what owns it.
- `Command interface` — the command groups the CLI has gained (lifecycle, compare, rasterize, vault, claims, panes) instead of one `Semantic commands` card; `Contract runner` rebound onto `lib/execution.ts`, the file that runs a contract.
- `Semantic renderer` and `Renderer layout` — rebound from `src/runtime/semantic-renderer/lib` to `src/transformers/semantic-renderer`, with the host seam, the two hosts, the reading and flank choice and the scorecard drawn. The renderer's own render sequence is now a flow on the current variant.
- `Browser application`, `Board viewer` — the in-tab renderer, the read-only picture cache (ADR 0023) and the one JSON transport.
- `Agent workbench`, `Codex session` — the workhorse, the coordinator, the epoch ledger, the board tools and the approvals.
- New: `Board rasterizer`, `Codex workhorse`, `Voice coordinator`, `Skill evaluation`.

Drill-downs: 26 DRILL_DOWN_LEVEL_MISMATCH and 2 DRILL_DOWN_ONLY_NODE at the start; one warning left, on a frozen historical variant. Every link-only card was replaced by the caller that is really there (`Agent CLI` and `Browser` on `Canvas server`, `Command catalogue` on `Command dispatch`, `Workhorse start` and `Codex transport` on `Codex session`), or moved onto the container the board describes (`Browser client`, `Agent workbench`, `Codex session`).

Reachability: all 15 boards reachable from `Archboard` through drill-downs, no link naming a board the vault does not hold (scripted breadth-first walk of the current variants).

## Renderer defect found and fixed

Authoring the new `Renderer layout` content made `semantic render` and `semantic rasterize` throw `undefined is not an object (evaluating 'from.layoutOptions')` for that board, and only when a predecessor is passed — which is every CLI or browser render of a variant that has one. `attachmentOffset` in `src/transformers/semantic-renderer/lib/layout/compound-node-hints.ts` assumed every relationship has ports, but `edgeOf` (compound-graph.ts) makes none for a relationship whose faces the router chooses: a skip a first render does not bracket. Two new cards joined by such a skip crashed the layout. Fixed by returning no offset when the ports are absent, with a focused owner in `src/runtime/semantic-renderer/tests/new-card-placement.test.ts` that fails without the guard.

## Scorecards re-recorded

`src/runtime/semantic-renderer/tests/wide-boards.test.ts`: all fifteen vault boards re-recorded (four are new rows). Every board moved the same way and for the same reason — the boards carry the subsystems built since September plus the callers ADR 0029 asks for, so they are larger pages at a smaller fit. `Archboard` 1.00 -> 0.71 fit at 0.70 -> 1.43 Mpx; `Canvas server` 0.97 -> 0.52 at 1.22 -> 4.17 Mpx; `Command interface` 1.00 -> 0.42 at 0.73 -> 5.08 Mpx; `Codex session` 0.99 -> 0.60 (it gained its real callers and a transport). Nothing regressed on what the suite holds as a threshold rather than a recording: every board still draws no route through a card, every label on a straight run of its own route, strand at most 0.85 against a bound of 1, and bends per route at most 2.17 against 3.

`Skill evaluation` was 4596x2348 with its parts inside one container; drawn flat, as the sibling modules they are, it is 3188x1207. That is the only board whose shape was chosen for the drawing rather than the code, and the containment it lost was not real containment.

Every board was rasterized and read, not just measured.

## Using the skill (feedback)

The recipes carried the work. Four things the skill or the product did not tell me, in the order they cost time:

1. **The skill does not say a board must render with its predecessor.** `semantic rasterize` on a variant that has a parent draws the comparison, not the variant, and that is the picture a reader gets. The recipes say 'draw and look' but the worked examples are all root variants, so nothing warns an author that adding parts to a derived variant is a different drawing problem. It is also how the renderer defect above stayed hidden: `wide-boards.test.ts` renders every vault board without predecessors.

2. **`resolve` cannot take the other side when that side is an addition or a removal.** `--side theirs` on a `deleted-and-changed` issue is refused with 'which is an ordinary edit to this proposal rather than a choice between two values'. The refusal is clear, but `references/variants.md` presents `mine`/`theirs` as a general choice, and a batch mixing competing-field and deleted-and-changed issues is refused whole with every subject named, which reads as though none of them could be answered. Worth a line: answer the competing fields as sides, the deletions as an ordinary edit.

3. **Edge identity is checked against the predecessor, not against what you read.** Restating `my9Bj1QK` with one changed label was refused because it differs from the *historical* variant by three properties. `references/edit.md` says two or more changed properties make a replacement, without saying two or more *relative to the variant this one came from*. That is a real trap on a derived variant, where a relationship you have never touched may already be one change away from its limit.

4. **Views and walkthrough beats mint their own ids.** Passing a readable `id` for a new view or beat is refused for the block-id alphabet. `references/authoring.md` says new subjects leave `id` out for nodes and relationships; it does not say the same for views, beats and flows.

One thing that reads oddly and is not wrong: on a container carrying an upward link, the icon chip says the level of the board it *opens*, so `Browser client` wears a System chip and `Agent workbench` a Service one. ADR 0029 is unambiguous and the checker has no exemption, but a reader who has not read the ADR will take the chip for a claim about the box. Worth a sentence in the ADR's consequences, or a different chip for an upward link.

Verified independently of the worker: 15 boards at system/service/module, every one reachable from Archboard by drill-down with no link naming a board the vault lacks; 221 bindings across every variant, of which the only 5 that name a missing path sit on the frozen historical variant Renderer layout/Initial; ./bin/dogfood check reports one warning, on that same historical variant; and every gate lane passes (lint, fmt, type-check, 3247 module tests, 163 system tests, the repository lane and the serial browser lane at exit 0). Acceptance criterion 1 is left unchecked: a historical variant refuses content edits by design, so no accepted write can repair those five paths, and a binding that named a file which existed then is a correct record rather than a fault.
<!-- SECTION:NOTES:END -->
