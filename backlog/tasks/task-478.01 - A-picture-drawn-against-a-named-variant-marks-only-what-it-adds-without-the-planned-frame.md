---
id: TASK-478.01
title: >-
  A picture drawn against a named variant marks only what it adds, without the
  planned frame
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
updated_date: '2026-10-15 17:11'
labels: []
dependencies: []
parent_task_id: TASK-478
priority: high
type: feature
ordinal: 840000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A stacked pull request needs a picture of only its own change. Today `semantic render` draws a variant against the current variant, or on a board with no current variant against the variant it was branched from, and always inside the "Planned" frame on such a board (ADR 0031). On a built board, the marks then include every PR below in the stack. On an unbuilt board, every PR picture says nothing is built, although the PR builds code. The device trust stack (Platform #599 to #615) worked around both by copying each proposal into a temporary vault, and then explained the workaround in the PR bodies. The user decided that each PR is drawn against the PR below it, without the frame. `semantic compare --against` already names the variant to read against (src/cli/commands/lib/read-against.ts); the pictures and recordings cannot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `semantic render`, `semantic rasterize` and `semantic record` take `--against <variant>`; the picture, and every frame of the recording, marks what the drawn variant adds, changes and removes relative to the named variant, the same entries that `semantic compare --against` reports
- [x] #2 A picture or recording drawn with `--against` carries no planned frame, also on a board with no current variant; without `--against`, render output is byte-identical to today
- [x] #3 An unknown `--against` variant is refused as `semantic compare --against` refuses it; `--against` with `--no-comparison` is refused, and so is `--against` naming the drawn variant itself
- [x] #4 The render and rasterize receipts name the `--against` variant as `comparedWith`, and a replay of a recorded talk draws the same comparison
- [x] #5 ADR 0031 records that a picture drawn against a named variant reads relative to that variant and carries no frame
- [x] #6 The `archboard` consumer skill documents `--against` on render, rasterize and record, the `evals/` inputs follow where a scenario covers comparison pictures, and test owners cover the three commands
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: renderBoard takes an optional against, a variant id or name. drawingOf reads the variant against it instead of comparedWith, and the answer carries no planned frame whenever against is named.

An unknown variant and the drawn variant itself are UNKNOWN_VARIANT. The render route reads against. Without it nothing changes: render output is hashed on a copy of the dogfood vault before and after.

2. CLI: --against on render, rasterize and record. One helper in lib/read-against.ts resolves it as compare does, exit 2, and refuses the drawn variant itself. --against with --no-comparison is a usage refusal. comparedWith on the receipts is changes.against of the answer.

3. Recording: the talk keeps board.against, optional so a kept talk reads as before and the version stays 1, and the replay page draws every picture against it. This needs a small change in src/ui, which is outside the stated fence, so it gets its own commit and is reported.

4. ADR 0031 amendment, skills/archboard render and record guidance, evals scenarios that cover comparison pictures, generate:skill-artifacts.

5. Tests: renderer module owner for against, no frame, refusals and default unchanged. CLI system owner in tests/system/semantic-boards for render and rasterize receipts and refusals. Talk schema owner. Replay page owner.

Boards: Command interface, Semantic renderer, Board rasterizer, Archboard server routes and Board viewer, each branched as TASK-478.01 with Render, Rasterize, Record, Board answer, Board routes, Record command, Talk files, Replay page, Picture cache and Local pictures restated. They are corrected to what was built and adopted at closing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: one option, --against <variant>, on render, rasterize and record, and it is also what removes the Planned frame (a picture relative to a named variant says nothing of whether the board is built; ADR 0031 amendment). The CLI resolves it with readAgainst as compare does (exit 2, same message), also refuses the drawn variant itself and --no-comparison with --against; it sends the variant's id to the server, which refuses an unknown or the drawn variant as UNKNOWN_VARIANT and refuses against with comparison off as BAD_REQUEST. Receipts: comparedWith is the answer's changes.against; record and replay receipts gain against (id or null). The talk keeps board.against (optional, validated against its document, format version stays 1; older archboard refuses such a talk, ADR 0041 amended).

Fence departures, each needed because the replay page draws in the browser and the render answer is assembled in shared code: src/shared/semantic-board/lib/drawing.ts (drawingOf takes the named variant), src/runtime/semantic-board-client/index.ts (the option), src/ui/semantic-board-canvas (request carries against; picture cache, local pictures and query keys name it) and src/ui/walkthrough-replay/lib/replay-page.ts (draws every picture against the talk's variant), ADR 0041 amendment, INSTALL.md. UI is its own commit (48f37288e).

Byte identity without --against: 288 render answers (12 boards x variants x comparison on and off x light and dark, embedded faces) of a copy of the dogfood vault hashed through the render route before and after, cmp identical. README assets: render output is unchanged, so no asset picture changes; readme:check lists all 16 assets stale including the banner, which this change does not touch.

Closing: code check run with and without --variant TASK-478.01 gave the same 21 findings, none introduced or cleared; the proposal's new relationship Walkthrough replay -> Picture source is anchored on drawAgainst. Footprint against 408c5b880^ (base is the parent of the first Refs commit): named and changed Render, Rasterize, Record, Board answer, Board routes, Recording entry, Picture cache, Local pictures, Walkthrough replay. Plan correction: the talk keeps the variant in the recording entry (index.ts) and the shared talk schema, not in Talk files, so Talk files and Replay page (bound to index.ts, code in lib/replay-page.ts) were put back and Recording entry and Walkthrough replay named instead. Changed but not named, passthrough only: Board client (renderSemanticBoardOnServer takes against), Replay command (receipt gains against), Fetch semantic reads and Semantic queries (request type and key), Commands, Semantic viewer, Walkthrough recorder, Bun host (a test), Renderer core (board.ts is Board answer). Boards behind from this task's commits, read and still right: Browser application (Walkthrough replay), Archboard server, Skill evaluation (evals coverage). All five proposals adopted (Command interface v88, Semantic renderer v53, Archboard server routes v58, Board rasterizer v52, Board viewer v106).

Narration follows --against (fix of a gap): a recording made with --against hears every subject's standing against the variant its frames are drawn against, and only a recording without --against, and live narration, keep comparedWith. Path: semantic record resolves the variant id (already) -> recordingPageUrl sets the search parameter against on the recording page address -> recordingAskedOf reads it -> WalkthroughRecorder starts voice with recording: { language, against } (RecordingNarrationSchema gained optional against, so the browser's voice start command carries it with no new field on the wire) -> narrationFor keeps it per narrated pane (walkthrough-narration.ts) -> narrationChangeOf passes it to narratedSubjects(board, variant, beat, against), which reads the beat against that variant's content in place of comparedWith. An unknown or vanished variant leaves nothing to read against: standing null, as for a branch from nothing; it does not throw. The browser only names a lens (a variant id); the server still reads the walkthrough and the board itself. Proof: src/server/archboard/tests/walkthrough-narration-against.test.ts (the narration path: a stacked board, a recording against the lower PR hears 'unchanged' for the lower PR's part and 'added' for its own; without against and live both keep 'added' for both; an unknown against gives null) and tests/system/cli/recording-page-address.test.ts (the address carries against and the page reads it back). Boards: no board changes. The change adds an optional field to data that already flows on drawn relationships (Voice coordinator and Agent workbench: Realtime voice, Semantic context; Archboard server) and adds no part, no relationship and no binding, so the TASK-478.01 proposals need no new proposal for it.

Gate: bun run check passed at e92b4f82f plus the skill commits (exit 0, no failing test in any lane, serial browser lane included). Rerun by the parent: tests/system/semantic-boards/draw-against.test.ts 5 pass, src/server/archboard/tests/walkthrough-narration-against.test.ts with the presentation-mode tests 8 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic render, rasterize and record take --against <variant>. The picture, every recorded frame and the voice of a recording read the drawn variant against the named one, and such a picture carries no Planned frame, also on a board with no current variant. Without --against, render output is byte-identical (288 hashes before and after). Refusals match semantic compare --against, and --no-comparison or the drawn variant itself are refused. Receipts name comparedWith, the talk keeps against, and replay draws the same comparison. ADR 0031 records the amendment, and the archboard skill and evals coverage document the option. Proven by draw-against.test.ts, drawn-against.test.ts, talk.test.ts, walkthrough-recording and walkthrough-replay system tests, and walkthrough-narration-against.test.ts. Boards: Command interface, Semantic renderer, Archboard server routes, Board rasterizer and Board viewer adopted TASK-478.01. Commits 408c5b880, 48f37288e, a05a6e76a, e92b4f82f.
<!-- SECTION:FINAL_SUMMARY:END -->
