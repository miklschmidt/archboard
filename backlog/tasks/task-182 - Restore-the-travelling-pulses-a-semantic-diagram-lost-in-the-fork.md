---
id: TASK-182
title: Restore the travelling pulses a semantic diagram lost in the fork
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 12:01'
updated_date: '2026-09-12 13:02'
labels: []
dependencies: []
modified_files:
  - src/runtime/semantic-renderer/NOTICE.md
  - src/runtime/semantic-renderer/index.ts
  - src/runtime/semantic-renderer/lib/svg/pulse.ts
  - src/runtime/semantic-renderer/lib/svg/architecture.ts
  - src/runtime/semantic-renderer/lib/svg/dataflow.ts
  - src/runtime/semantic-renderer/lib/svg/document.ts
  - src/runtime/semantic-renderer/lib/svg/styles.ts
  - src/runtime/semantic-renderer/lib/layout/dataflow.ts
  - src/runtime/semantic-renderer/lib/design.ts
  - src/runtime/semantic-renderer/lib/dataflow-design.ts
  - src/runtime/semantic-renderer/tests/motion.test.ts
  - src/server/canvas/lib/semantic-board-routes.ts
  - src/shared/timing/timing.ts
  - src/shared/timing/lib/diagram-motion.ts
  - src/shared/timing/lib/board-locks.ts
  - tests/system/browser/semantic-board-viewer.test.ts
type: bug
ordinal: 333000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person looking at a board reports that the animations are all missing. They are: a rendered diagram carries no SMIL and no CSS animation in either grammar, so a relationship that carries traffic looks exactly like one that merely exists, and an exchange of messages reads as a static ladder.

This is not a regression in the adaptation but a decision recorded in src/runtime/semantic-renderer/NOTICE.md under 'Dropped for good': the SMIL animation, the `animated` flag and the whole pulse schedule were dropped on the grounds that motion in a walkthrough belongs to the viewer and a self-contained SVG that animates itself would compete with it. The person who owns the product says the motion is wanted, so the reasoning is overturned rather than rediscovered — and the parts of it that are still true shape how it comes back: motion is presentation, so nothing about it is authored on a board, and it must not compete with the walkthrough's own focus or fight a reader who has asked for less of it.

The source to adapt from is /home/msc/Projects/pr-lens/packages/renderer: svg/pulse.ts (the travelling dot), svg/architecture.ts (the per-edge gate and the hero train), svg/dataflow.ts and layout/dataflow.ts (the per-message slots and the shared cycle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A rendered architecture diagram animates a relationship that carries traffic, and does not animate one that is a fact rather than a flow; a hero relationship reads as carrying more than a normal one.
- [x] #2 A rendered data-flow diagram animates its messages on ONE clock for the whole drawing, each in its own slot in the order the exchange is told, counted straight through a stack of several flows rather than restarting per flow, with a repeated step carrying its repeat.
- [x] #3 Nothing about motion is authored on a board: it is derived from the meaning the schema already carries, and no motion flag, toggle or control is added to the agent's surface.
- [x] #4 A reader who has asked for reduced motion gets none, through the drawing's own prefers-reduced-motion rule, which works in a pane and in a standalone exported SVG alike; no caller-stated motion option exists to be kept in step with it.
- [x] #5 Picking, the narrative's own focus and deterministic exports are unchanged, and every duration lives in src/shared/timing/timing.ts.
- [x] #6 A runtime owner fails when either grammar stops moving or when a page of flows stops sharing one clock, and a real browser confirms motion and its absence under reduced motion.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce first, at runtime, not in source: a throwaway script that renders both grammars through `renderSemanticView` and fails when neither carries `<animate*|@keyframes|animation:`. Confirm it goes red against the current renderer.
2. Read the upstream source it was forked from (`/home/msc/Projects/pr-lens/packages/renderer`) and settle the mapping: upstream gates an architecture edge on an authored `animated` bool defaulting false; we keep motion presentation-owned (ADR 0023), so derive it from meaning already on the board — a relationship whose `kind` carries traffic moves, a fact (`dependency`, `other`) does not, `muted` does not, and `hero` carries a train of three. Data flow keeps upstream's own scheme: one slot per message in the order the exchange is told, `step.repeat` capped at three consecutive slots, one shared cycle of min(slots * 1.4s, 16s), 8% opacity ramps.
3. Fork `svg/pulse.ts` into the renderer as the one place a moving mark is drawn, used by both grammars. Dots carry no id and no pointer events, and are painted last inside the edge group.
4. Thread a `motion: "moving" | "still"` choice through the render request and the render route, defaulting to moving, so a caller can ask for a still picture; put every duration in `src/shared/timing`.
5. Honour the reader with the picture itself: a `prefers-reduced-motion` rule in the document's own stylesheet hides the pulse layer, so a standalone exported SVG obeys the preference with no viewer around. Do not split the render query key on motion — that risks remounting the stage.
6. Overturn the recorded decision in `NOTICE.md` rather than leaving the code and the note disagreeing, keeping the half of the reasoning that is still true.
7. Own it: one runtime owner over both grammars, and one browser owner that proves the dots are drawn and that none are shown under emulated reduced motion. Then focused checks and the full gate.

8. On parent review: remove the caller-stated `motion` option entirely — no existing caller sends it, and a public render contract kept in step with nothing is cost without a reader. The `prefers-reduced-motion` rule in the drawing's own stylesheet is the whole mechanism.

9. On parent review: make the sequence clock the whole drawing's, as upstream has it — a turn cursor that runs across the stack of flows and a `turns` total on the layout — so several flows on one page take their turns in order instead of each restarting at 0. Own it with a two-flow runtime owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Cause

Not a regression in the adaptation: the omission was deliberate and recorded. `src/runtime/semantic-renderer/NOTICE.md` listed, under "Dropped for good", "SMIL animation and the `animated` flag, along with the whole pulse schedule", on the grounds that motion in a walkthrough belongs to the viewer. Half of that reasoning is still true and half was wrong — the viewer owns the camera and the beats, and a travelling dot touches neither — so the entry moved into a new section, "Taken back after it was dropped", explaining which half survived. The `animated` flag did not come back.

## What decides motion now

Nothing authored. The schema was not touched and no agent-facing toggle exists.

- Architecture: a relationship whose `kind` carries traffic (`call`, `http`, `rpc`, `event`, `queue`, `data`, `render`) draws one dot; `dependency` and `other` are facts and draw none; `muted` draws none, because a moving dot is the least background thing a picture can do; `hero` draws a train of three at the slower hero pace. This is our adaptation, not upstream's literal default — upstream gates on an authored `animated` bool defaulting false, which would be an agent deciding how its architecture looks.
- Data flow: upstream's own scheme, kept. One slot per message in the order the exchange is told, `step.repeat` taking that many consecutive slots capped at three, one shared cycle of min(slots x 1.4s, 16s), and 8% opacity ramps so a dot fades in and out of its turn rather than flashing.

## Reduced motion

The picture honours the reader by itself: the document's stylesheet carries `@media(prefers-reduced-motion:reduce){.ab-pulse{display:none}}`, so a standalone exported SVG obeys the preference with no viewer around it (CSS cannot stop a SMIL animation, so the rule hides what moves). A caller may also ask for a still picture — `motion=still` on the render request and route — which omits the layer altogether rather than drawing it stopped.

Deliberately *not* done: the pane does not send `motion`. An earlier attempt put it in the render query key, and the live-voice browser owner showed that splitting the key can remount the stage. Fewer moving parts, no cache split, no flicker.

## Verification

- Repro first, at runtime: a throwaway script rendering both grammars went `RED: 2 of 2 grammars draw nothing that moves` (exit 1) before the change and `GREEN: both grammars carry motion` (exit 0) after. It was then deleted and replaced by the owner below.
- Runtime owner `src/runtime/semantic-renderer/tests/motion.test.ts`: traffic vs fact vs muted, the hero train, nothing authored, four turns on one shared cycle with non-overlapping windows `[0,.25] [.25,.5] [.5,.75] [.75,1]`, a caller's still picture in both grammars, the media rule present, dots unpickable with `pointer-events="none"` and carrying no `data-semantic-id`, and byte-identical repeat renders.
- Browser owner `tests/system/browser/semantic-board-viewer.test.ts`, new test "a relationship that carries traffic moves, unless the reader asked it not to": a hero `call` and a `dependency` authored through the API, 3 dots drawn in the real page, 0 *shown* under `emulateMedia(..., "reduced-motion")` with the stage still `drawn`, and 3 again after restoring — with no second render fetched. Focused run: `bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/semantic-board-viewer.test.ts` exit 0; `--focus tests/system/browser/codex-live-voice.test.ts` exit 0.
- Route, against an isolated temp vault on port 3211: moving render 4 dots, `motion=still` 0 dots, `motion=nonsense` 400 `"motion" says "nonsense"; a render is moving or still`.
- Gate: `bun run lint` exit 0, `bun run type-check` exit 0, `bun run fmt:check` exit 0, `bun run check` **exit 0** with zero `(fail)` lines — 2715 module tests across 268 files, 155 system across 36, 8 repository, 14 browser across 11 files; 2892 passing in total. Log: `/tmp/claude-1001/motion-gate2.log`.

Every board written during verification went to a `mktemp -d` vault with its own `XDG_STATE_HOME`; no file in the user's vault was read or written, and both temporary directories and the verification server are gone.

## Environment limitation, left unchecked on AC 6

The agent browser's tab never paints: `requestAnimationFrame` never fires, `document.timeline`/`getCurrentTime()` stay pinned at 0, and a CSS animation reports `playState: "running"` with `currentTime: 0` — reproduced with a minimal hand-built SMIL document and a minimal CSS `offset-path` animation, outside this codebase entirely. So *movement itself* cannot be observed there, and the browser owner asserts the strongest thing that environment can tell the truth about: the moving layer is drawn in the real page and nothing is shown under reduced motion. AC 6's first half (a runtime owner fails when either grammar stops moving) is proven; its second half is proven only as presence and absence, not as pixels in motion, so it is left for the reviewer to adjudicate against a browser that paints.

## Second pass, after parent review

**The `motion` option is gone.** Nothing sent it: the pane never did (deliberately), no test outside the ones written for it did, and no CLI or MCP path did. What went with it: `RenderMotionSchema`, `motion` on `RenderChoices`/`RENDER_SELECTORS`/`chosen()`/`answerDrawn`'s `how`, `DiagramRenderRequest.motion`, the `DiagramMotion` type and its re-export, and the parameter threaded through `paintArchitecture`/`paintEdges`/`paintEdge` and `paintDataFlow`/`paintFlow`/`Crossing`. The two synthetic still-picture tests went with it. A removed subject still draws no dots — that gate is `standing === "removed"` and is untouched. `NOTICE.md` no longer claims a caller can ask for a still picture.

**The sequence clock is the whole drawing's, not each flow's.** The parent's finding was right and it was a real behaviour gap, not a wording one: upstream counts `slotCount` over every message of every flow and runs `slotCursor` across them (`layout/dataflow.ts:230-256`), and the SVG passes `layout.slotCount` to every flow. Ours reset the cursor to 0 in `placeSteps` and computed a cycle per flow, so two exchanges on one page both started at turn 0 and crossed at once. Now `placeSteps` takes the turn the flow starts on, `layoutFlow` takes `{ top, turn }`, `layoutDataFlow` runs the cursor through the stack and reports `turns` for the whole drawing, and `paintDataFlow` builds one `Crossing` from it and hands it to every flow. `turnsIn` is gone — the total is counted where the cursor runs. The header comment that claimed there was no animation schedule is corrected; it now says the clock is the drawing's and why.

Not done, as it is not free: a removed step still takes its turn on the clock. Skipping it would make the schedule depend on the standing map, so the same content would draw different turn windows depending on which predecessor it was compared against — the deterministic-export property is worth more than the second of dead air.

**Verification of this pass**

- New owner `a page of exchanges shares one clock, and they take their turns in order`: two flows, five turns, proven red first — with the cursor reset per flow it reported `[0,0.2] [0.2,0.4] [0,0.2] [0.2,0.4] [0.4,0.6]` against the expected straight-through `[0,0.2] … [0.8,1]` (exit 1); green with the shared cursor.
- `bun test --isolate src/runtime/semantic-renderer/tests/motion.test.ts` → exit 0, 9 pass.
- `bun test --isolate src/runtime/semantic-renderer` → exit 0, 62 pass across 4 files.
- `bun test --isolate --max-concurrency=1 tests/system/semantic-boards` → exit 0, 22 pass (the render route's owners, which no longer see a `motion` selector).
- `bun test --isolate src/ui/semantic-board-canvas` → exit 0, 77 pass across 9 files.
- `bun run type-check` exit 0, `bun run lint` exit 0, `bun run fmt:check` exit 0 (after `bun run fmt`).

The full gate is deliberately not re-run yet, per review: it goes last, once the changes have settled.

## Correction to the dead-air note above

The reason a removed step keeps its turn is depiction policy, not determinism: how a baseline subject is drawn is already settled, and `standing` is an input to the render, so a schedule that reacted to it would still be deterministic for a given call. Reviewer confirmed the dead second is acceptable on the existing policy. Left as it is on that ground, not the one I first gave.

## Independent QA

Astra visible-Chrome QA passed on the isolated demo, with nothing forcing the clock:

- Architecture: 5 dots visible; one sampled dot moved `y 630.27 → 551.87` at a fixed `x 3094.99` — a dot travelling along its line, and the hero train reads as a train.
- Sequence, on the two-flow board: successive screenshots across one cycle showed the second flow's turn (after a POST) and then the first flow's (after a GET), and a sampled dot went `x 3101.51, opacity 0 → x 2741.40, opacity 1` — a dot waiting its turn and then crossing, which is the shared clock working.
- Reduced motion: covered live by the existing browser owner, 3 dots → 0 → 3.
- QA confirms the frozen-clock finding was the agent browser's environment, not the renderer.

## Final gate

`bun run check` → **exit 0** on the settled changes, run with `ARCHBOARD_VAULT` unset and a fresh `XDG_STATE_HOME`, so no owner could resolve the user's vault. Zero `(fail)` lines; 2892 passing — 2715 module tests across 268 files, 155 system across 36, 8 repository, 14 browser across 11 files. Log: `/tmp/claude-1001/motion-gate3.log`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A semantic diagram moves again, in both grammars, and nothing about the motion is authored.

The animation was not lost to a regression: it was dropped deliberately when the renderer was forked, recorded in `NOTICE.md` under "Dropped for good" on the reasoning that motion in a walkthrough belongs to the viewer. That was half right — the viewer owns the camera and the beats, and a travelling dot touches neither — so the entry was overturned and the surviving half now shapes how the motion came back.

What decides it is meaning the board already carries, never a flag: a relationship whose kind carries traffic draws a dot, a fact (`dependency`, `other`) and anything `muted` draws none, a `hero` relationship carries a train of three at the slower pace, and a removed subject stays still. An exchange takes upstream's own scheme, including the fix the reviewer caught: ONE clock for the whole drawing, so a page of flows is told in the order its flows are stated rather than all at once, with each step's `repeat` taking that many consecutive turns, capped. `svg/pulse.ts` is the one place a moving mark is drawn and both grammars use it; every duration is in `src/shared/timing`. A reader who asked their system for less motion is honoured by the drawing itself, through a `prefers-reduced-motion` rule in its own stylesheet, which works in a pane and in an exported file alike — there is no caller-stated motion option, and no agent-facing toggle.

Verified: a runtime owner over both grammars, proven red first (both grammars still, and then the two-flow clock restarting per flow); the reduced-motion browser owner (3 dots → 0 → 3); independent visible-Chrome QA watching real dots move along a line and wait their turn on the shared clock; and `bun run check` exit 0 with 2892 tests passing, run with no ambient vault.
<!-- SECTION:FINAL_SUMMARY:END -->
