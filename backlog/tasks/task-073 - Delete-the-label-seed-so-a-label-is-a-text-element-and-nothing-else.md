---
id: TASK-073
title: 'Delete the label seed, so a label is a text element and nothing else'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 20:15'
updated_date: '2026-08-20 22:58'
labels: []
dependencies:
  - TASK-072
references:
  - src/core/labels.ts
  - src/core/normalize.ts
  - scripts/check-labels.mjs
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: enhancement
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 6 of docs/design/the-plan.md. The second half of the one-representation work: once conversion happens once on write, the seed has nothing left to do and keeping it is keeping the bug alive.

WHAT THE SEED IS. One fact spelled two ways, both stored. A labelled rectangle carries `label: {text: "AuthService"}` on the container, and a bound text element, and a `boundElements` entry pointing at it. All three survive a round-trip today. The seed is deliberately not cleared when the text element exists, because `labelStatements` re-states it (TASK-028) so an agent's rename can still win. The same doubling applies to `start: {id}` and `end: {id}` on an arrow against `startBinding` and `endBinding`, and to `text` on a non-text element, which `normalize.ts:134` turns into `label` on the update path and `labelSeedOf` reads back from either.

WHY IT BRED BUGS. Two spellings need a rule for which wins, the rule has to run on every cycle, and every one of TASK-024, TASK-028 and TASK-029 was that rule being wrong in a new way. TASK-024 ended with one arrow carrying 42 copies of its own label and collapsing to a height of 0.9999999999999716.

WHAT TO DELETE. `labelStatements` (src/core/labels.ts:345) and `labelClearances` (:408) go. `planLabelExpansion` (:193), `adoptReusedLabelIds` (:261) and `dropSpentLabelSeeds` go with the conversion in the task before this one. After that a human retyping a label edits a text element, and the text element is the label. There is no seed to keep in step, so TASK-028 and TASK-029 stop being possible rather than staying fixed.

WHAT STAYS. The seed stays as INPUT. An agent can still write `{"type":"rectangle","label":{"text":"AuthService"}}` and it is still the ergonomic way to draw. It is consumed at the write boundary and never stored. Reading a board back gives a container and a bound text element, and `describe` folds them into one line, which is what an agent actually wants and what ADR 0015 points at.

THE CHECK. `scripts/check-labels.mjs` has 128 checks and most are about machinery this deletes. Rewrite it rather than trying to keep it passing. Its subject becomes: a label written as a seed lands as exactly one text element, a rename by an agent and a rename by a human both produce one text element with the new text and no seed anywhere in the store, and an emptied label leaves no text element behind.

Also worth a check of its own, because it is what TASK-024 actually was: write and read the same labelled arrow fifty times and assert the bound text count never moves off one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 label, text on a non-text element, start and end are accepted as input and never stored
- [x] #2 labelStatements and labelClearances are deleted, and nothing replaces them
- [x] #3 A rename by an agent and a rename by a human both leave exactly one text element carrying the new text, and no seed anywhere
- [x] #4 An emptied label leaves no text element behind, and the old text does not return (TASK-029)
- [x] #5 Fifty write-and-read cycles on one labelled arrow leave exactly one bound text element (TASK-024)
- [x] #6 check-labels.mjs is rewritten around one representation and bun run test is green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish what still reads the stored seed: relabelBoundTexts (input, stays), expandElementsForExport's labelText (input, stays), frontend changes.ts labelStatements/labelClearances (the second spelling, goes), describe/promote label fallbacks (already fall back to the bound text).
2. Stop storing it: restoreServerFields in expand-elements.ts no longer restores `label`; `text` on a non-text element is already dropped there.
3. Close the one path that stored an unconverted container: PUT /api/elements/:id filtered the container out of expandForBoard's result, so the merged element kept its seed. Store what the conversion returned, as the batch and changes routes already do.
4. Delete labelStatements, LabelStatement, labelClearances, LabelClearance from src/core/labels.ts and their use in frontend/src/canvas/changes.ts.
5. Decide stage 5's binding repair in expandForBoard on evidence: delete it, run check-labels, restore it if something fails, and say which.
6. Rewrite the affected part of scripts/check-labels.mjs: the two 'not luck' reverts become 'the seed is not there to revert to', add fifty write-and-read cycles on one labelled arrow (TASK-024), and assert no store element carries a seed.
7. Prove it by reverting each half and counting the failures. bun run test green.
8. Evaluate start/end (AC 1) separately: rerouteBoundArrows reads them from the store to decide which arrows the server owns the path of, which is not the same fact as startBinding. Attempt, measure, keep or file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT CHANGED. expandElementsForExport no longer restores `label` onto an element bound for the board; `text` on a non-text element was already dropped there. PUT /api/elements/:id stores what the conversion returns instead of filtering the container out of it, which was the one path that left a merged element on the board with its seed still on it. labelStatements, LabelStatement, labelClearances and LabelClearance are deleted from src/core/labels.ts, and the block in frontend/src/canvas/changes.ts that called them is gone with its import. check-labels.mjs is 169 -> 174 checks.

WHAT STILL READ THE SEED, AND HOW THAT WAS ESTABLISHED. Grepped every reader, then reverted each half and counted. Two read it as input and stay: relabelBoundTexts, which turns an agent's rename into an edit to the text element, and expandElementsForExport's own `label?.text || text`, which is the conversion. Two read it as a stored second spelling and go: labelStatements and labelClearances. describe.ts and promote.ts read it with a fallback to the bound text, so both answer the same after the change.

REVERT-PROOFS. Restoring `label` to the store fails 11 of 174 label checks, including 'moving the box reverted its label to "AuthService"' (TASK-028 back). Restoring the PUT filter alone fails 1: 'a rename over PUT left its seed on the board'. Taking stage 5's binding repair out of expandForBoard fails 3. With the seed restored, obsidian, boards, branch, side-by-side and the browser check all still pass, so this property lives in check-labels and nowhere else.

STAGE 5'S BINDING REPAIR SURVIVES, NARROWER. A binding is written down at both ends and either end can be the one that survives; the expansion looks only at the container's end. Deleting the seed changed which write reaches that case: no longer any write to a container carrying a stale seed, only a write carrying a label of its own, which means a rename.

FIXED-POINT STILL REPORTS ZERO: 0 of 12 elements came back changed. Nothing about what a note holds moved, because the seed was already stripped on the way out to a file; what changed is what the board holds while it is open.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 22:58
---
AC 1 is left unchecked on its second half, and it needs a decision rather than more work. `label` and `text` on a non-text element are accepted as input and never stored, and check-labels asserts both against a real server. `start` and `end` on an arrow are still stored, deliberately.

They are not the doubling the description takes them for. `rerouteBoundArrows` reads them to decide which arrows the server may re-route when a shape moves, and the arrows carrying them are exactly the ones whose path the server computed in the first place. An arrow a person drew carries `startBinding` and no `start`. Reading the binding instead would widen that set to every bound arrow on the board, and `resolveArrowBindings` recomputes a path edge to edge with a fixed gap of 8 and no `focus`, so an agent nudging a box would jerk every hand-drawn arrow attached to it onto the server's own idea of where it goes. Removing the refs needs the server to know Excalidraw's binding math first.

So: either accept the carve-out and close this, or split the arrow refs into their own task behind that binding math. Recorded in docs/design/the-plan.md under stage 6.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The label seed is read at the write boundary and never stored, so a label is a text element and nothing else (ADR 0015). An agent still writes `label: {text}` and `describe` still folds a container and its bound text into one line; what is gone is the board's second copy of the words, and with it labelStatements and labelClearances, which existed to keep that copy in step. TASK-028 and TASK-029 stop being possible rather than staying fixed. Verified by scripts/check-labels.mjs, rewritten around one representation at 174 checks: putting the seed back on the board fails 11 of them, including a human's rename reverting when an agent moves the box, and restoring the PUT route's filter fails one more. bun run test green, 21 suites, fixed-point still 0 of 12 elements changed. AC 1's arrow refs are carved out with a reason, in the comment and in the plan.
<!-- SECTION:FINAL_SUMMARY:END -->
