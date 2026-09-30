---
id: TASK-029
title: Emptying a label in the browser brings the old text back
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 22:41'
updated_date: '2026-08-19 23:11'
labels:
  - needs-triage
dependencies: []
ordinal: 29000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Clearing a label in the browser leaves it cleared after a reload
- [x] #2 An agent setting a label on a shape whose text is not yet expanded is not wiped by the same path
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
THE SIGNAL. Excalidraw does not treat an emptied bound text as a rename to the empty string; it treats it as a deletion. App.handleTextWysiwyg's onSubmit computes isDeleted = !nextOriginalText.trim(), marks the text element isDeleted, and calls fixBindingsAfterDeletion, which strips the text from the container's boundElements. So by report time the live board has neither the text nor the binding, and nothing distinguishes that container from one an agent has just labelled whose seed is not expanded yet — except the deleted text element itself, which is still in the scene and still names its container. That tombstone is the deletion signal. It is impossible to confuse with an unexpanded seed, because an unexpanded seed leaves nothing behind.

WHY NOT THE OBVIOUS FIX. Clearing the seed on the strength of a container upsert with no bound text is the trap TASK-029 was raised to avoid: absence is not evidence, and reading it as one wipes an agent's label and undoes TASK-024. There is a check for exactly this (see below), and it fails when the naive rule is substituted.

CHANGES.
- frontend/src/canvas/useCanvasSession.ts: the three diffAgainstBaseline call sites now pass api.getSceneElementsIncludingDeleted() instead of api.getSceneElements(). diffAgainstBaseline already skipped isDeleted elements when building upserts and nextBaseline, so the report on the wire is unchanged — the function just gains sight of why an id stopped being reported. (Not one of my named files, but the pane is the only place the scene is fetched, and the change is one word at three sites.)
- src/core/labels.ts: new pure labelClearances(upserts, deletes, scene), the deletion counterpart to TASK-028's labelStatements. A clearance is emitted for a container when the scene holds a deleted text element naming it, the container is still live, it has no live bound text left, and the report is already speaking about that container (it is in upserts, or the dead text is in deletes). The last condition is not correctness but silence: a tombstone lingers until the next delivery rebuilds the scene, and without it every report in that window would restate the same clearance and bump the element's version for nothing.
- The clearance states BOTH label: null and text: null. labelSeedOf reads either, and the server merges upserts onto what it holds rather than replacing them, so striking out one leaves the seed alive in the other.
- frontend/src/canvas/changes.ts: clearances are folded into the report exactly as statements are — onto an existing container upsert, otherwise a minimal patch, and only for a container the server already holds. The deletes list is now computed before the label pass because a clearance is keyed off it. Statements and clearances are disjoint by construction: a container with a live keeper text gets a statement, one with none gets a clearance.

INBOUND SAFETY. Nothing about an unexpanded seed can produce a clearance, since there is no deleted text element to produce one from. Confirmed live (an agent labelling a shape the pane had never expanded) and as a unit assertion that fails when the naive absence rule is substituted.

VERIFICATION (isolated canvas on port 3300, my own browser tab; port 3000 untouched; canvas cleared, tab closed and server stopped afterwards).

Reproduced the bug live first, with only labelClearances stubbed out and everything else in place: emptied the label on a box reading 'Cache', the server kept label {text: Cache} with the text element deleted, and a full page reload put 'Cache' back on the box and the element count back up. The board undoing a deliberate clearing, on screen.

With the fix on, the same edit: server immediately read label: null, text: null on the container and the text element gone (8 elements -> 7). Then six agent update cycles, including updates to the cleared container itself, and a full page reload -> still blank, still 7. Instrumented the report path to see the mechanism rather than infer it: the report carrying the clearance was {tombs: [[textId, text, cache, '']], upserts: [cache], deletes: [textId]}, and the very next report — tombstone still in the scene, nothing else to say — was {upserts: [], deletes: []}, i.e. the guard did suppress the repeat. Instrumentation removed afterwards.

Neither earlier fix regressed. An agent labelling a shape whose text had never been expanded ('Cache' on a freshly added box, and 'RedisCache' onto the very container that had just been cleared) rendered correctly and grew exactly one bound text. A human retype ('Gateway' -> 'EdgeRouter', and 'RedisCache' -> 'MemcacheTier' on the previously cleared box) landed in both the text element and the stored seed, survived a reload, and left one bound text per container throughout.

Worth recording as a trap for the next agent driving this by hand: the first double-click after a page load does not enter text editing, and backspacing and escaping more than the 400ms debounce apart lets an intermediate onChange report label {text: ''} — which masks the bug by accident. Two early runs looked like failures for that reason and were not.

REGRESSION CHECK (scripts/check-labels.mjs, 51 -> 80 checks). Models the emptying the way Excalidraw performs it — blank() marks the text element isDeleted and unbinds it from the container — plus a 'clear' flag mirroring TASK-028's 'state', and a reportOf that now builds upserts and deletes from the live board while computing the label pass against the scene including tombstones. The model's expander also gained the real converter's own guard (if element.label?.text), so a null or empty seed is not expanded. Four new blocks: a cleared label stays cleared across 25 cycles and a fresh-baseline reload, with the untouched labels undisturbed and the box relabellable afterwards; the same run with 'clear' off must bring the old words back, so the check cannot pass by being toothless; a unit block on labelClearances covering the trap (an unexpanded agent seed is not a deletion), a container that still has a keeper text, a lingering tombstone the report is silent about, and a container deleted along with its label; and clearing one label while retyping another in the same pass.

Mutation-tested both ways: stubbing labelClearances to return [] fails 13 checks; substituting the naive 'clear on a container upsert with no bound text' rule fails exactly the three trap assertions.

bun run type-check clean. bun run test green: stdio wire checks, local bind, obsidian, changes+injection, 80 labels, 47 library, surface parity.

Orchestrator verification: full suite green, labels 51 to 80 checks, parity unchanged at 32 paired. The agent reproduced the bug live with its own fix stubbed before building it, and mutation-tested both directions, including that the naive 'clear on a container upsert with no bound text' rule fails exactly the three trap assertions.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:41
---
Residual left by TASK-028, flagged by that agent. Retyping a label now sticks. Emptying one does not: Excalidraw deletes the bound text element, so the change report carries no text upsert for the correction to attach to, the seed survives on the server, and the old text returns on the next full load.

Same family as TASK-028 but it needs a deletion signal rather than a statement, and the obvious shortcut is unsafe. Clearing a label on the strength of a container upsert alone would wipe a seed an agent has just set on a shape whose text has not been expanded yet, which is exactly the inbound case TASK-024 exists to protect.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Emptying a label sticks. Excalidraw treats an emptied bound text as a deletion, marking it isDeleted and unbinding it, so by report time the live scene looks identical to a shape an agent just labelled whose seed is unexpanded. The tombstone is the difference: the deleted text element is still in the scene naming its container, and an unexpanded seed leaves nothing behind. The pane was discarding tombstones by reading only live elements; it now reads deleted ones too, and a clearance is emitted only when a tombstone names a still-live container that has no bound text left.
<!-- SECTION:FINAL_SUMMARY:END -->
