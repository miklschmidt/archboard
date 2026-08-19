---
id: TASK-029
title: Emptying a label in the browser brings the old text back
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 22:41'
updated_date: '2026-08-19 22:49'
labels:
  - needs-triage
dependencies: []
ordinal: 29000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clearing a label in the browser leaves it cleared after a reload
- [ ] #2 An agent setting a label on a shape whose text is not yet expanded is not wiped by the same path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the deletion signal. Excalidraw's onSubmit for an emptied bound text marks the text element isDeleted (App.tsx handleTextWysiwyg) and then calls fixBindingsAfterDeletion, which strips the text ref from the container's boundElements. So the live scene loses both the text and the binding — but the *tombstone* survives in the scene with its containerId intact. That tombstone is the signal: it says a text element was deleted, which an unexpanded seed can never look like.
2. Surface it. frontend/src/canvas/useCanvasSession.ts builds every report from api.getSceneElements(), which filters tombstones out. Switch the three diff call sites to api.getSceneElementsIncludingDeleted(). diffAgainstBaseline already skips isDeleted elements when building upserts and nextBaseline, so the report itself is byte-identical; the function simply gains sight of why an id went missing.
3. src/core/labels.ts: add a pure labelClearances(upserts, deletes, scene) alongside labelStatements. A clearance is emitted for a container when (a) the scene holds a deleted text element naming it, (b) the container is still live, (c) it has no live bound text left, and (d) the report is already talking about that container — it is in upserts, or the dead text is in deletes. (d) keeps a lingering tombstone from re-stating the same clearance on every later report.
4. Clear both label and text. labelSeedOf falls back to element.text, and the server merges upserts rather than replacing, so a clearance must state label: null and text: null or the seed survives in the fallback.
5. frontend/src/canvas/changes.ts: fold clearances into the report the same way statements are folded — onto an existing container upsert, otherwise a minimal patch, and only for a container the server already holds. Statements and clearances are disjoint by construction (a container with a live keeper text gets a statement; one with none gets a clearance).
6. Inbound stays safe by construction: an agent's seed on a shape whose text has not been expanded produces no tombstone, so no clearance is possible. Verified explicitly, both alone and with a stale tombstone in the same scene.
7. scripts/check-labels.mjs: model the emptying the way Excalidraw does it (tombstone + unbind), add a 'clear' flag mirroring 'state', and assert: an emptied label stays empty across many cycles and a fresh-baseline reload; with clear off it must come back (so the check is not toothless); an agent setting a label on an unexpanded shape survives; retyping still sticks; counts and ids hold.
8. Verify live on port 3300 with my own browser tab: empty a label, force several sync cycles and a full reload, confirm it stays empty; then an agent label on a fresh shape, and a retype. bun run test and bun run type-check. Leave the canvas cleared.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:41
---
Residual left by TASK-028, flagged by that agent. Retyping a label now sticks. Emptying one does not: Excalidraw deletes the bound text element, so the change report carries no text upsert for the correction to attach to, the seed survives on the server, and the old text returns on the next full load.

Same family as TASK-028 but it needs a deletion signal rather than a statement, and the obvious shortcut is unsafe. Clearing a label on the strength of a container upsert alone would wipe a seed an agent has just set on a shape whose text has not been expanded yet, which is exactly the inbound case TASK-024 exists to protect.
---
<!-- COMMENTS:END -->
