---
id: TASK-071
title: >-
  A check that renders a board in a real browser and reports what the browser
  changed
status: To Do
assignee: []
created_date: '2026-08-20 20:14'
updated_date: '2026-08-20 20:14'
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
- [ ] #1 A check writes a board covering every agent-creatable element type, renders it in a real browser, and reports every element and field the browser changed
- [ ] #2 Version, versionNonce, updated and the server timestamps are ignored, and what is ignored is stated in the script
- [ ] #3 How a browser is driven in the check suite is decided and written down, since no existing check drives one
- [ ] #4 The check runs against today code and records today baseline rather than failing, and is not yet part of bun run test
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:14
---
No dependency on TASK-069 on purpose: this is check infrastructure and can be built in parallel with the id work. Its recorded baseline will shift once TASK-069 lands, which is a re-run rather than a rewrite.
---
<!-- COMMENTS:END -->
