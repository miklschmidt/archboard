---
id: TASK-073
title: 'Delete the label seed, so a label is a text element and nothing else'
status: To Do
assignee: []
created_date: '2026-08-20 20:15'
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
- [ ] #2 labelStatements and labelClearances are deleted, and nothing replaces them
- [ ] #3 A rename by an agent and a rename by a human both leave exactly one text element carrying the new text, and no seed anywhere
- [ ] #4 An emptied label leaves no text element behind, and the old text does not return (TASK-029)
- [ ] #5 Fifty write-and-read cycles on one labelled arrow leave exactly one bound text element (TASK-024)
- [ ] #6 check-labels.mjs is rewritten around one representation and bun run test is green
<!-- AC:END -->
