---
id: TASK-071
title: >-
  A check that renders a board in a real browser and reports what the browser
  changed
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:14'
updated_date: '2026-08-20 21:12'
labels: []
dependencies: []
references:
  - scripts/check-boards.mjs
  - scripts/check-side-by-side.mjs
  - docs/design/server-is-the-truth.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: task
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 4 of docs/design/the-plan.md. Build the check before the thing it checks, because it is the only way to know the converter work is finished.

WHY THIS CHECK AND NOT A UNIT TEST. Dropping `convertToExcalidrawElements` removes a converter we do not control. It does not remove Excalidraw. Excalidraw is still the renderer, it holds the document while a human edits it, and it silently corrects anything it disagrees with at render time. So "there is one converter" is not the property that matters. The property that matters is that what we write is a fixed point: a document Excalidraw does not change.

Measured, and this is the baseline this check has to record:

  Board                                     Elements changed on one render
  A saved 15-element board, opened          13 of 15
  A board already in native form            0 of 13

Five text elements re-measured, three arrows gaining a `width` and `height` the note did not carry and points inset by half a pixel, ten `index` values rewritten, one freedraw gaining `lastCommittedPoint`, three containers getting a `label` seed added back. Under ADR 0015 each of those corrections is a write, so a board an agent draws headlessly gets rewritten the first time somebody looks at it.

WHAT THE CHECK DOES. Take a board covering every element type an agent can create: rectangle, ellipse, diamond, standalone text, line, freedraw, a bound arrow and a labelled bound arrow. Write it through the server. Render it in a real browser. Force a full change report. Diff what comes back against what the server holds, ignoring `version`, `versionNonce`, `updated` and the server's own timestamps. Report every element and field the browser changed.

THE INFRASTRUCTURE IS NEW AND THAT IS THE WORK. No check in `scripts/` drives a browser today. `check-boards.mjs` and `check-side-by-side.mjs` stand sockets in for panes and say so in their headers: "No browser: a pane is a socket plus a picture". So this needs a headless browser in the check suite, which the repo does not have and which is a dependency decision, not a detail. Settle it as part of this task and write down what was chosen and why. If a headless browser cannot be added, say so and the converter work loses its acceptance check, which is worth knowing before that work starts rather than after.

STAY GREEN. Land the check asserting today's measured baseline rather than zero, and do not wire it into `bun run test` until it can assert zero. The task that replaces the converter flips the assertion to zero and adds it to the suite. That way this lands without breaking anything and the converter work has an unambiguous target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check writes a board covering every agent-creatable element type, renders it in a real browser, and reports every element and field the browser changed
- [x] #2 Version, versionNonce, updated and the server timestamps are ignored, and what is ignored is stated in the script
- [x] #3 How a browser is driven in the check suite is decided and written down, since no existing check drives one
- [x] #4 The check runs against today code and records today baseline rather than failing, and is not yet part of bun run test
- [x] #5 The check drives a real browser with agent-browser, and reads the rendered elements back with eval
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Settle how a check drives a browser: agent-browser (already on PATH) with a session of its own, open + eval, no new dependency.
2. Find a read-back: the frontend exposes no Excalidraw handle, so walk the React fiber from the .excalidraw node to the App instance and read its scene. Rejected forcing a change report, which needs a keystroke to arm the pane and so edits the board it is measuring.
3. scripts/check-fixed-point.mjs: throwaway canvas on a free random port with a throwaway vault, a board covering every agent-creatable type, saved so the document under test is the note our exporter writes, reopened with reload into the browser's pane.
4. Wait for document.fonts.ready and for the scene to stop moving, then diff what the pane holds against what the server holds, field by field, ignoring the six fields cleanElementForExcalidraw strips plus versionNonce and updated.
5. Assert field names rather than values, against today's measured baseline, and plant a width Excalidraw must correct so a future zero cannot be a broken read-back.
6. Wire it as test:browser only, out of bun run test until TASK-072 flips the baseline to zero.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A browser can be driven from a check, and it costs no dependency. agent-browser is on PATH already; two commands carry the whole check (open, eval) and it brings its own headless Chrome. The check runs in its own session so it cannot touch a tab a human is using, and on a free random port with a throwaway vault like every other check.

The read-back was the part that could have failed. The frontend exposes no handle on the Excalidraw API, so the check walks the React fiber up from the .excalidraw node to the App instance and calls scene.getElementsIncludingDeleted(). That is an internal; when it breaks it fails loudly with 'no Excalidraw app instance' rather than reporting a false zero. The alternative, forcing a change report, is worse: a pane only reports once userInteractedRef is set, so arming it needs a keystroke, and the keystroke edits the board, mixing the check's typing into the corrections it is trying to measure.

Two things move under the check after the render. Excalidraw loads a scene's fonts when the scene arrives and re-measures text once they land, and re-routes bound arrows when the labels they point at change size. So the check waits for document.fonts.ready and then polls until the scene is byte-identical across three consecutive reads. It also asserts field names rather than values, because whether the text measurement lands on the fallback or on Virgil depends on font-load timing, and pinning 208.85975646972656 would make this a font-version detector.

Measured baseline, 2026-08-20: 8 of 12 elements come back changed. Four texts re-measured and moved (width, height, x, y), rawText dropped from all five texts, index rewritten on four elements, both arrows inset by half a stroke width, freedraw handed lastCommittedPoint, pressures and simulatePressure. The board is 8 agent-drawn elements; the note writer expands the labels to 12.

Ignored: createdAt, updatedAt, syncedAt, source, syncTimestamp, version, versionNonce, updated. The first six are exactly what cleanElementForExcalidraw strips on the way into the scene, so the browser never sees them; a check asserts that list still matches the frontend so the two cannot drift apart.

11 seconds end to end including the frontend rebuild, which it does itself because dist/frontend is half of what it measures.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:14
---
No dependency on TASK-069 on purpose: this is check infrastructure and can be built in parallel with the id work. Its recorded baseline will shift once TASK-069 lands, which is a re-run rather than a rewrite.
---

author: @claude
created: 2026-08-20 20:38
---
The unknown in this task is resolved, from the user: a headless script can drive a real browser with `agent-browser`, which is on PATH here (/run/current-system/sw/bin/agent-browser) and ships alongside chromium.

It is a browser automation CLI with the commands this check needs: `open` to load the canvas, `eval <js>` to read Excalidraw's elements back out of the running page, and `screenshot` if a failure ever needs looking at. Run `agent-browser skills get core --full` before writing against it; it ships its own usage guide and the maintainers say to prefer that over guessing from flag docs.

So this stops being a spike and becomes an ordinary task. Two things follow.

The plan's contingency is dead. docs/design/the-plan.md says that if driving a browser from a check turns out to be impossible, the converter stage has no acceptance test. It is possible, so the converter stage keeps its acceptance test and that paragraph should go when this lands.

The reason it was unknown at all is worth recording: no script under scripts/ drives a browser today. All fifteen checks stand WebSocket clients in for panes and say so in their comments. That was read as evidence it could not be done, when it only ever showed that nobody had.
---

author: @claude
created: 2026-08-20 20:39
---
CI note, from the user. If this check is to run in CI, something has to run `agent-browser install` there first, to fetch the browser it drives. On this machine it is already installed alongside chromium; a fresh CI runner has neither.

That also needs a headless run and no display, which the tool supports but which is worth proving on a runner rather than assuming from a laptop where a browser is already working.

Sequencing: this is only a CI concern once CI runs the suite at all. Today it runs two of the fifteen checks (TASK-082), so a browser check would not execute there even after it is written. Do not wire the install step into CI as part of this task; do it as part of whichever task puts the suite in CI, so the two land together and the runner is proved once.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
scripts/check-fixed-point.mjs, run with bun run test:browser, writes a board covering every element type an agent can create, saves it so the document under test is the note our exporter writes, renders it in a real headless Chrome through agent-browser, and reports every element and field the browser changed. Verified by running it: 8 of 12 elements come back changed, with the fields named per element, reproducibly across runs and in 11 seconds including the frontend rebuild it does itself. It asserts that baseline rather than zero, so it lands green; TASK-072 flips it to zero and adds it to bun run test. A planted width Excalidraw must correct proves a zero would be real rather than a broken read-back, and bun run test is still green because the check is deliberately outside it.
<!-- SECTION:FINAL_SUMMARY:END -->
