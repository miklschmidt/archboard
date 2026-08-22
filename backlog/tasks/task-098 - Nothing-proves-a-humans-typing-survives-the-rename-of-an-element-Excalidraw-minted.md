---
id: TASK-098
title: >-
  Nothing proves a human's typing survives the rename of an element Excalidraw
  minted
status: Done
assignee:
  - '@claude'
created_date: '2026-08-22 20:00'
updated_date: '2026-08-22 20:43'
labels: []
dependencies:
  - TASK-069
  - TASK-078
references:
  - scripts/check-live-session.mjs
  - src/core/board-io.ts
  - src/core/obsidian-md.ts
priority: high
type: task
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while checking whether TASK-065's fifth acceptance criterion was met. It is not, and the gap is specific.

TASK-069's measured hazard: with a text editor open on a bound label in a real browser, applying a document in which that element had been renamed discarded five typed characters — no error, no warning, nothing visible. That is the failure the whole id-minting stage exists to remove.

TASK-069 removed it for the ids **archboard mints**: every one is eight characters from Obsidian's block alphabet, so the note writer has nothing to rename. But Excalidraw mints 21-character ids in the browser for anything a person draws, and `obsidian-md.ts` still renames those through `derivedId`, because a block reference cannot hold one. TASK-078 then moved that rename from save time to **the write boundary**, which is the hot path — so it now fires on the first write after a person draws a text element, rather than occasionally on an explicit save.

TASK-078 recorded the risk honestly and offered 42 cycles of live browser editing with no lost keystroke as evidence. **That evidence does not cover this case.** `check-live-session`'s `retype` targets the bound text of an agent-created container, which already carries a server-minted eight-character id, so no rename fires during those 42 cycles. The check never creates a text element in the browser at all. It proves typing survives a write; it does not prove typing survives a rename, because no rename occurs in it.

So the property TASK-065 AC 5 states — an echo cannot rename an element out from under a cursor — holds for the ids archboard mints and is untested for the ids Excalidraw mints.

Two ways out, and which is right is the decision this task carries.

**Prove it safe.** Drive a real browser, draw a text element by hand so Excalidraw mints the id, start typing, let the write and its rename land, and assert every character survived.

**Or remove the case.** Give a browser-minted text element a block-shaped id before anybody can type into it, so nothing needs renaming later. That is the shape TASK-069 chose everywhere else, and it makes the hazard structurally impossible rather than tested for.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A real browser draws a text element, a person types into it, the write and its rename land, and no character is lost — or the rename no longer happens
- [x] #2 The check fails if the guarantee is removed, proved by reverting it
- [x] #3 TASK-065's fifth criterion can then be checked on evidence rather than on argument
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build the reproduction first, because its result is the route decision. New scripts/check-typed-into.mjs: its own canvas on a free port, its own temp vault, a headless agent-browser session. Real trusted input — the text tool, a mouse click on empty canvas, keystrokes — so Excalidraw mints the id rather than the check inventing one.
2. Measure with the editor open: type, pause past REPORT_DEBOUNCE_MS so the write and its rename land, type again, Escape. Assert every character is on the board. Guard against a vacuous pass: the editor must still be open at the pause, a report must have gone out, and the board and the pane must agree at the end — a duplicate text element is the other failure this can produce.
3. If it loses characters, take the structural route. The rename cannot happen while the editor is bound, wherever it is done, so: hold a text element out of the change report while it is being edited, and rename it in the pane the moment the editor closes, through the same derivedId the server would have used. Deterministic, so the two agree without saying so.
4. settleBlockIds and the obsidian-md fallback stay, as the backstop for notes archboard did not write.
5. Revert-proof each half separately and count the failures. bun run test green, with the new check never running beside live-session.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
MEASURED, BEFORE ANYTHING WAS CHANGED. Both cases lose characters on this build, in a real headless Chrome, with no error and nothing on screen.

  a hand-drawn text     typed 'hello', paused, typed ' world'  -> 'hello'      (6 lost)
  a hand-added label    typed 'ABCDE', paused, typed 'FGHIJ'   -> ''          (all 10 lost)

The second is worse than TASK-069's five because the label is empty when the rename lands, so nothing at all reaches the board. In both, appState.editingTextElement still names the id Excalidraw minted while the scene holds the settled one: 'ab4PdCAjb1uuOe6u6U1bR' against 'uY9wnYbt'. That is the whole failure in one line.

ROUTE: structural, both halves in the pane, no change to settleBlockIds or the obsidian-md fallback.

REVERT-PROOF, on scripts/check-typed-text.mjs (26 checks):

  withhold reverted                  9 fail
  the pane's own rename reverted     2 fail
  both                               9 fail

Reverting the withhold does more than lose the characters: the pane keeps re-reporting the id the server renamed away, so the board ends up holding three copies of one text element ('' , 'hello', 'hello world'). Reverting the rename loses no character, because withholding alone gets that; what it loses is the property that no answer a pane receives can carry a rename, which the last two checks read straight off the wire.

IMPLEMENTED, all in the pane. src/core/board-io.ts's settleBlockIds and the note writer's own rename are untouched and stay as the backstop for a note archboard did not write.

- frontend/src/canvas/changes.ts: diffAgainstBaseline takes a withheld set. An element in it is not upserted, and it keeps whatever print the baseline already had rather than the one it has now, so the edit is still owed and goes out on the first report after the editor closes. One the server has never seen stays out of the baseline entirely.
- frontend/src/canvas/useCanvasSession.ts: idUnderEditor reads appState.editingTextElement; withheldIds is what the report, the rename and the echo all ask. settleForeignTextIds renames every non-block-shaped text element that is not under an editor, through derivedId, rewiring containerId, boundElements and either end of a bound arrow, and runs at the top of sendReport.
- applyServerScene now carries withheld elements over from the scene and keeps them out of the re-agreed baseline. It also runs elementsForScene itself rather than taking an already-validated list, and that ordering is load-bearing: elementsForScene drops a boundElements entry pointing at an element the delivery does not carry, which is exactly the container of a label being typed into, so merging has to happen first. The three other callers pass the raw cleaned document now.
- A reconnection (initial_elements) passes withheldIds too, so it cannot take a half-typed label off the glass. board_switched deliberately does not: that element belongs to the board being replaced.

ACCEPTED, AND WORTH KNOWING. While the editor is open the container has reached the server, and the note, with a boundElements entry naming an element the board does not hold yet. It settles on the report after the editor closes. elementsForScene strips it for any other pane, and settleBoundArrows only ever adds, so nothing acts on it; the alternative was withholding the container too, which would have unbound the label on the pane that is typing into it.

VERIFIED. bun run test green, 24 steps, 171 s, exit 0, no FAIL line, and each of the three browser checks reached its own report line: fixed-point 0 of 12 elements changed, typed-text all passed, live-session 42 of 42 cycles agreed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The rename is gone from the case that had it, and the case is now a check.

Reproduced first, because which of the two routes was right depended on it. In a real headless browser, with the code as it stood: a text element drawn with the text tool took 'hello', sat through one write, took ' world' and came back as 'hello'; a label added by double-clicking a box took 'ABCDE', sat through one write, took 'FGHIJ' and came back as ''. Six characters and then all ten, silently. appState.editingTextElement still named the 21-character id Excalidraw minted while the scene had already been given the settled one, which is the failure in one line.

So the structural route, in the pane. The element under a text editor is withheld from the change report, so the server is never told a name it would want to change; and the moment the editor closes, the pane renames it itself through the same derivedId the server would have called. The two reach one name without a round trip, and no answer a pane gets back carries a rename at all. settleBlockIds and the note writer's rename stay as the backstop for notes archboard did not write.

The proof is scripts/check-typed-text.mjs, 26 checks, in the suite as test:typing and serial with the other two browser checks (TASK-097). It uses the text tool, a mouse click, a double-click and real keystrokes, so Excalidraw mints the ids rather than the check inventing them, and it guards its own window: a second element is nudged so a report really goes out with the editor open, and the label case asserts the container reached the server naming the label the pane is still holding. Its last two checks read the ids off the wire, which is the half a surviving character cannot tell you about.

Revert-proof: withhold reverted, 9 fail, and the board ends up holding three copies of one text element; the pane's rename reverted, 2 fail; both, 9. bun run test green, 24 steps, exit 0, all three browser checks reaching their report lines.
<!-- SECTION:FINAL_SUMMARY:END -->
