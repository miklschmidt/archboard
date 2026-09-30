---
id: TASK-028
title: A human renaming a label in the browser gets reverted
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 22:11'
updated_date: '2026-08-19 22:41'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 28000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Retyping a label in the browser sticks; the next conversion pass does not rewrite it
- [x] #2 The stored label follows the bound text when a human edits it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the direction-of-authority rule. Server->browser: the stored `label` seed is an instruction (agent rename wins). Browser->server: the bound text element is the statement (human rename wins). The two cannot fight because the browser writes the resolution back immediately, so a disagreement never persists long enough to need arbitration.
2. src/core/labels.ts: add a pure `labelStatements(upserts, scene)` — for every bound text element in a change report, the container's label that must be stated alongside it. Keyed off boundTextsByContainer so only the keeper text speaks for a container.
3. frontend/src/canvas/changes.ts: fold those statements into the report's upserts (merging into an existing container upsert, otherwise a minimal {id,label} patch, which the server's merge-not-replace upsert applies cleanly). Only for containers the server already knows (in the baseline or in the same report) so a statement can never conjure a typeless element.
4. Confirm the inbound invariant the rule rests on: a container in the browser scene carries no `label`, so a seed reaching planLabelExpansion is always news from this delivery. Enforce it in frontend/src/canvas/elements.ts if the converter leaks one.
5. scripts/check-labels.mjs: model the report path (the pane's diff already is modelled) and add the human-rename direction — retype a bound text in the pane, run many cycles, assert the text survives, the seed follows, the element count and text ids hold. Keep the agent-rename check green.
6. Verify live on port 3300 with my own browser tab: retype a label in the browser, force several sync cycles (including a full reload, which is the pass that reverted), confirm it sticks and the count does not grow; then confirm an agent-side rename still applies. bun run test and bun run type-check. Leave the canvas cleared.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
THE RULE. The two edit directions are told apart by which way they travel, not by inspecting the disagreement. An agent's rename arrives inbound as a seed the browser has not seen; a human's rename leaves outbound as text the server has not seen. So each direction gets one authority — inbound the stored `label` seed (unchanged, TASK-024's containment), outbound the bound text element — and there is nothing to arbitrate. I deliberately rejected the alternatives: comparing updatedAt on the container against the text (the container's stamp is bumped by any agent write, so an agent moving a box after a human rename would revert it), and reading `source`/`syncedAt` for provenance (PUT /api/elements/:id does not reset `source`, so a container the browser once synced keeps reading frontend_sync forever). Both are inference about a stale record; the direction rule needs no inference because the correction is immediate.

WHAT IMMEDIATE BUYS. The reason this had to go on the report path rather than the next conversion is that a stale seed is dangerous for as long as it sits on the server: any delivery that happens to carry that container along — an agent moving the box, another pane's report, a page reload — hands the stale seed back to containment, which dutifully applies it. Stating the label alongside the text closes that window to one report (~400ms debounce). The residual race is a genuine concurrent edit: an agent and a human writing the same element inside that window.

CHANGES.
- src/core/labels.ts: new `labelStatements(upserts, scene)`. For every bound text in a change report, the container label that must be stated with it. Only the keeper text (the one Excalidraw draws) speaks for a container, so a stray second text cannot rewrite the label out from under the one on screen. Pure, no imports, like the rest of the module.
- frontend/src/canvas/changes.ts: folds those statements into the report — into an existing container upsert, otherwise a minimal {id,label} patch, which the server's merge-not-replace upsert applies without touching anything else it knows. Guarded on the container being in the baseline or in the same report, so a statement can never conjure a typeless, geometry-less element. (Not one of my three named files, but the only place a report is built, and distinct from src/core/changes.ts which TASK-022 owns.)
- frontend/src/canvas/elements.ts: `dropSpentLabelSeeds` after conversion. A container that has its text element keeps no `label` in the scene, so a seed reaching containment is always news from the delivery just received rather than a record the pane has been carrying around. This was already true by accident of what convertToExcalidrawElements strips; it is now enforced, because the inbound half of the rule rests on it.

VERIFICATION (isolated canvas on 3300, my own browser tab, port 3000 untouched; labelled rect x3 + labelled arrow).

Reproduced live first, with only the outbound statement disabled and everything else in place: typed 'EdgeRouter' over 'Gateway' in the browser, server showed the split (text='EdgeRouter', label={'Gateway'}), reloaded the page — and the box came back reading 'Gateway'. The board undoing what somebody typed, on screen.

With the fix on, same edit: server immediately read text='EdgeRouter' AND label={text:'EdgeRouter'}. Then 6 agent update cycles, an agent update to the renamed container itself, and a full page reload -> still 'EdgeRouter' on screen and on the server, count fixed at 8 elements, same text element id throughout (cJWbiX2TejeA2E). Earlier in the same session a human rename of the rect ('AuthService' -> 'LedgerService') survived 20 agent update cycles, two updates to its own container and a reload, count fixed at 8, id 5thSIbQoqTV6VV unchanged.

Agent renames still win, including after a human rename of the same element: 'update gw --set text=IngressGateway' and 'update wire --set text=AMQP' both applied on screen and converged to text elements on the server, ids unchanged, count still 8. Shape and arrow both.

REGRESSION CHECK (scripts/check-labels.mjs, 34 -> 51 checks). Models the outbound half the same way the inbound half was modelled: `dropSpentSeeds` (the pane keeping no spent seed), `reportOf` (the diff, with the statement behind a `state` flag), and a `types` hook that retypes a bound text in the pane the way a person does — into the text element and nowhere else. Three new blocks: a human retype survives 25 cycles and a fresh-baseline reload with the seed following and the element ids and count held; the same run with `state` off must revert, so the check cannot pass by being toothless; and an agent rename after a human retype still wins without either direction growing a second label. Mutation-tested: stubbing labelStatements to return [] fails exactly the 6 new assertions.

bun run type-check clean. bun run test green: 5 stdio wire checks, local bind, 108 obsidian, changes+injection, 51 labels, 26 library, surface parity.

KNOWN RESIDUAL, adjacent and not fixed here: emptying a label rather than retyping it. Excalidraw deletes the bound text, the report has no text upsert to attach a statement to, and the stored seed survives — so the label comes back on the next full load. Same family as this bug but it needs a different signal (a deletion, not an upsert), and clearing a label on the strength of a container upsert alone risks wiping a seed an agent has just set on a shape whose text has not been expanded yet. Worth its own task.

Also unchanged and pre-existing: after an agent rename the server's bound TEXT element lags behind the seed until the pane next reports (the pane only reports on an Excalidraw onChange). The board renders correctly and `label` — what describe/query read — is right immediately; only the text element's copy waits. Observed both before and after this change.

Canvas cleared, browser tab closed, server on 3300 stopped.

Orchestrator verification in a browser: double-clicked a box reading Gateway, retyped EdgeRouter, escaped. The stored label became EdgeRouter immediately rather than on some later pass. Six agent updates to that same box left it EdgeRouter at two elements. An agent rename to IngressGateway afterwards still won, also at two elements. Full suite green including parity; labels went 34 to 51 checks.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:11
---
Flagged by the TASK-024 agent and worth acting on: the stored label seed is never updated when a human retypes a label in the browser, so the next conversion pass rewrites it back.

Not a regression. The old code did the same thing, but it expanded the stale seed into a duplicate that won, so the symptom was litter rather than a revert. With labels now singular it shows plainly as the board undoing what somebody typed.

That matters more than its size suggests. Renaming a box is one of the most ordinary things a person does at a whiteboard, and the whole premise here is that a human edits the board and the agent reads it back. A rename that silently reverts breaks that in the most visible way possible.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A human's rename sticks. The two edit directions are told apart by which way the change is travelling rather than by arbitrating the disagreement: an agent's rename arrives inbound as a seed the browser has not seen, a human's leaves outbound as bound text the server has not seen, so each direction has one authority and there is nothing to adjudicate. The correction rides the change report so it is immediate, because a stale seed sitting on the server would be handed back by any later delivery carrying that container.
<!-- SECTION:FINAL_SUMMARY:END -->
