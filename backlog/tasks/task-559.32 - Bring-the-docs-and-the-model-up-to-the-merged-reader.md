---
id: TASK-559.32
title: Bring the docs and the model up to the merged reader
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T06:36:00Z'
updated_date: '2026-10-31T07:16:00Z'
labels:
  - docs
  - model
dependencies: []
parent_task_id: TASK-559
priority: medium
ordinal: 1004000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the door, card, label, column, Measures and relationship merges, the docs and this repository's own model lag behind the code. CONTEXT.md lacks new terms and keeps retired ones, docs/design/reader-redesign.md still states removed rules, no ADR records the door, tab and rule 6 changes, and the model does not describe model inspect or Measures. Four relationships are stale and six containers warn CONTAINER_PASS_THROUGH since the repair.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CONTEXT.md holds the new terms and removes the retired ones, in its glossary format
- [x] #2 reader-redesign.md, blocks-planned-layout.md and ADRs 0044, 0061, 0062 and 0064 no longer state what the code does not do
- [x] #3 One new ADR records doors, the edge tab, removal of rule 6, one-click doors and landing whole
- [x] #4 The three unplaced rules of the glossary work stand in their owners, and voice-prompt.ts no longer says boards
- [x] #5 The model describes model inspect, Measures, the right panel context and doors, and the four stale relationships are gone
- [x] #6 archboard check on this repository reports no warning that this work caused, or each one left has a reason in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Docs: 5efd96f73 CONTEXT.md, c6ae7ad5a the three unplaced rules and voice-prompt.ts, 88c6396dc the design docs and the ADR amendments, 80ef5ed5b ADR 0070.

Rule owners. skills/archboard/references/canonical-models.md holds the replacement rule and the stale comparison rule (code: readPredecessor in code-check/boards.ts refuses STALE_REVISION). skills/archboard/references/canonical-walkthroughs.md holds the saved talk rule (code: operations/model/replay.ts reads a talk and writes only a video).

Glossary doubts settled from code. Trace stays (TraceToggle in ModelPanelSubject.tsx). Implementation brief stays out, because no code holds it. Drill-down, level and view stay under Avoid, because only legacy boards hold them. Filter means hideKinds only. Key stays under Avoid in Legend on purpose. --bright-* stays a literal copy with door-button.test.ts, because theme.css holds only literal colours and :root cannot read a dark value.

Model: e1a55ef4f, written only through model claim, edit and release with a private XDG_STATE_HOME. Modules 539 to 544, relationships 1,074 to 1,091.

New parts, 6: Model inspect (Commands), Module interface (Canonical architecture, the one derivation behind the reader, model inspect and a comparison), Measures and Right panel (Model reading), Edge tab and Door button (Painting). The other text of the merged reader went into Model comparison, Shared model projection, Layout engines and the painters. Right panel got a part because the description of Model reading is at its 2,000 character limit. It costs no line.

Removed, code gone: wQBlFEQ3, mTr3mpxi, 9vLmTtXn, tWVYo1RT and the Variant timeline part. KWmrBUXU (Service routes to Repository listing) also went, beyond the four: openingVault is gone from service-routes.ts and nothing replaces the call.

Moved as TASK-559.28 intended: 7plLLcKh, oyurpL2B, ntLLD7Df. The layout no longer panics on them. sUAWU5K9 and 0dHSQwEC moved their source to Edge tab, because that code moved there.

Added because the check asked: Measured card painter to Measured text, Tray surfaces to Subject standing marks, Door button to Theme palette. Model reading to Shell is also new: removing tWVYo1RT showed that the reader imports the shell's Tree.

Anchors: all 12 ANCHOR_SYMBOL_MISSING, 2 ANCHOR_PATH_MISSING and the ANCHOR_MISMATCH are gone. 9T6sHrUv and its flow step now name semanticRenderQuery in queries.ts, because useDive takes the read as its draw function.

Renames: fRFvnVRE to CLI under test, Picture key to Legend entries, Key and export to Legend and export. Former names stay retained.

Stale claims corrected: Page start, Diagram presentation components, Service routes, Server requests, Repository listing, Workspace routing (no hidden groups exist), Subject atlas, Generation composition, flows DVK0aLi6 and StrSdB9p, and steps RPw8zIHG, XqwcLlCR, PKofi6GZ, sXXqUBYS. Step CDlrijzI keeps regions, because the layout crate and the atlas still use that word. Modules of the retained viewer keep inspector, and 111 code lines keep it too. Pane composition keeps the opening vault, because pane-core.ts still reads openingVault.

archboard check, before then after: CONTAINER_PASS_THROUGH 6 to 4, CONTAINER_LINE_TO_OWN_PART 1 to 1, ANCHOR_SYMBOL_MISSING 12 to 0, ANCHOR_PATH_MISSING 2 to 0, ANCHOR_MISMATCH 1 to 0, BINDING_PATH_MISSING 1 to 0, RELATIONSHIP_UNDRAWN 2 to 0, EMBED_OUTDATED 2 to 2, RELATIONSHIP_ON_CONTAINER 339 to 335 (information), EXPOSED_UNUSED 37 to 37 (information).

Warnings cleared with a real relationship. Child ownership: Generation composition to Epoch ledger (factories.ts#createCodexEpochStore). Panes and the workbench: Pane socket to Board announcements (websocket-connection.ts calls agentActivity.hold and snapshots).

Warnings left, each with its reason.
- Thread start, Shared thread policy and Rasterizing hold one part each, so no relationship can join two parts. Every caller already ends on that part after TASK-559.28, and a line on the frame undoes that repair. Thread start's responsibility describes Workhorse start, its sibling, so folding it is an owner's choice.
- Legacy board documents: only Board reading binds code. Board transitions, Durable writes and Board move have no binding and no relationship, and their code is gone, so nothing true joins them. They stay, because this task does not name them.
- IyzXWhR8: historyResult lives in operations/history/result.ts, in the folder of the container, and no part holds that file. A part for a result helper fails the card test, so the relationship stays.
- EMBED_OUTDATED on docs/readme/architecture-dark.svg and -light.svg comes from the baseline. A refresh follows docs/agents/readme-assets.md and needs --fix, which this task does not ask for.

Not settled: the summary of the current state still reads like a change note. It lives in model.json as current.summary, not in a module. model edit with proposal type edit on current refused with TARGET_CHANGED, "Select a draft state before editing its proposal", and no other public operation edits it. A file edit is forbidden, so it stays. Proposed text from PRODUCT.md: "Archboard is an architecture planning tool. The coding agent states what a system is: its parts, what contains what, how the parts talk, and in what order. The renderer draws every line."

Measures on every reading, measure2.ts, all-merged then catchup-1: fit gate 106 to 107 of 115, and no reading left it (Picture transitions joined at 0.658). Lines 1,765 to 1,794. Total area 186.0 M to 187.8 M. Lowest landing 0.205 to 0.211. Slowest drawing 475 ms to 443 ms. Readings below 0.4 went from 1 to 3: Canonical architecture and Architecture runtime API fell from 0.411 to 0.384, because Module interface adds lines there. Render entry fell from 0.942 to 0.614 with the same 14 lines.

Drafts: each of the 8 reads identical before and after, by digest of modules, relationships and collections, and no proposal file changed. All 72 flows name existing participants, and all 19 walkthroughs read. Two pinned walkthroughs name removed relationships (mTr3mpxi, 9vLmTtXn, tWVYo1RT), and those stay in checkpoint 6bc124a8. pcvrNsYC names none.

Not changed, for the owner: stopWorkhorses only interrupts the running turn, so the whole-tree stop of ADR 0048 is unimplemented (TASK-446 In Progress), and ADR 0048 stays as it is. PictureKey no longer exists in code, although a TASK-559.19 note says it stays. ADR 0047's implementation brief has no code. Many module texts still say board. Code comments in door-endpoints.ts and shell-geometry.ts are stale and were out of scope.

Gate: bunx vp run --no-cache check:all exit 0 at e1a55ef4f, 21 of 21 tasks, 48 of 48 browser owners.
<!-- SECTION:NOTES:END -->
