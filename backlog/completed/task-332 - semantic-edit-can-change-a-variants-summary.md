---
id: TASK-332
title: semantic edit can change a variant's summary
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:37'
updated_date: '2026-09-24 15:41'
labels:
  - store
  - cli
dependencies: []
priority: medium
type: feature
ordinal: 573000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A variant's summary is set only when it is branched (semantic branch --summary), and no command changes it afterwards, so TASK-328 left several dogfood current variants saying 'as implemented on 2026-09-13' although their content now describes 2026-09-24. User decision 2026-09-24: make it editable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An edit can set the summary of the variant it lands on, as part of the same one write
- [x] #2 Historical and shelved variants refuse a summary change as they refuse any content edit
- [x] #3 The consumer skill's edit reference and the generated schema name it
- [x] #4 One test owner proves the change
- [x] #5 Every dogfood current or draft variant whose summary names a date its content no longer describes is corrected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Payload field, not an option: VariantEditInputSchema gains summary (DescriptionSchema, optional). The edit contract already carries variant- and board-level facts in the batch (level; the target variant), and semantic new states its summary in its payload; semantic branch has --summary only because branch takes no payload. So the summary is said in the one batch the edit already is, and one write carries it with the content.
2. Store (transitions.ts editVariantTransition): a stated summary is a change to the variant, so editableVariant refuses it on a historical or shelved variant exactly as a content change (the 'changes content' test widens to 'changes the variant'). The summary replaces the edited variant's summary after the family is carried; it does not propagate, since a summary belongs to one variant and comparison does not count it.
3. CLI: semantic edit's description names the batch's summary; help derives from the contract. Client and server pass the parsed batch through.
4. Test owner: a store module test (src/runtime/semantic-board-store/tests), one test: a summary-only edit and a summary-with-content edit each land as one version on the named variant, leave other variants' summaries alone, and a historical and a shelved variant refuse it with nothing written.
5. Consumer skill: references/edit.md names summary; bun run generate:skill-artifacts regenerates semantic-edit-input.schema.json; evals/coverage.json gets a runtime-owner row.
6. Dogfood: affected board Board persistence (Lifecycle transitions' description says an edit may restate its variant's summary); proposal Board persistence@TASK-332. Command interface's Semantic authoring node is unaffected at its level of detail.
7. Dogfood summaries (AC 5): show all 15 boards, list every current or draft variant whose summary names a date its content no longer describes, prove the corrected summaries on a vault copy through the worktree server on port 3331, and report the exact commands for the parent to run against the real vault after merge.
8. Gate lanes one at a time; commit.

Revision: the edit-scope questions (editsContent, editsVariant, summarized) moved to src/runtime/semantic-board-store/lib/edit-scope.ts, which keeps transitions.ts under the 600-line limit and its apply under the complexity limit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision, payload field not --summary option: the edit contract already carries board- and variant-level facts in the batch (level, and the target variant, which --variant can override), and semantic new states its summary in its payload. semantic branch has --summary only because branch takes no payload. So the summary goes in the one batch the edit already is, and one write carries it with any content. The generated semantic-edit-input schema names it with no second definition.
Store: editVariantTransition passes 'content or summary changes' to editableVariant, so a historical or shelved variant refuses a summary exactly as a content change (VARIANT_HISTORICAL, VARIANT_SHELVED). summarized() sets the summary on the edited variant after the family is carried. It is not propagated: a summary belongs to one variant, and comparison does not count it. A summary-only edit on a live variant is one version and does not touch the descendants.
Test owner: src/runtime/semantic-board-store/tests/branching.test.ts 'an edit restates the summary of the variant it lands on, and a record refuses it'. It fails without the refusal change and without the summary write (checked each by reverting it).
Skill: references/edit.md step 3 names summary. archboard-dev closing step 2 now sets the summary the board carries once adopted, because an adopted TASK proposal's summary (the task title) becomes the board's current summary: Board persistence showed 'Adopting a proposal whose parent...' after TASK-331 was adopted. evals/coverage.json has a runtime-owner row.
Dogfood summaries (AC 5): current or draft variants whose summary names a date: Agent workbench, Archboard, Archboard server, Board viewer, Browser application, Codex session, Semantic renderer (all 'as implemented on/inspected 2026-09-13'). Board viewer's also names a module (semantic-viewer) that no longer exists. Board persistence's current summary is the TASK-332 title since its adoption. New summaries follow the scopes in .archboard/README.md and carry no date. Proven on a vault copy with the worktree server on port 3331: each board advanced by one version, only the current variant's summary changed, and check reported no diagnostics. The real vault's server on port 3000 runs pre-merge code that refuses the field. So AC 5 waits for the parent to run the reported commands after merge, with the dogfood server running the merged code.

Validation (worktree task-331, after the edit-scope refactor): type-check 0; lint 0; fmt:check 0; test:modules 3391 pass / 3 fail; test:system 181 pass / 0 fail; test:repository 8 pass / 0 fail; test:serial-browser 18 pass / 0 fail (run just before the store-internal refactor, which changes no behaviour). The 3 module failures are the wide-boards.test.ts renderer timeouts that also fail on a clean export of HEAD 02832131. Dogfood: Board persistence@TASK-332 branched and drawn (main d3b2eda3), checked against transitions.ts and edit-scope.ts, adopted at version 16 (main cd525e33); dogfood check reports no diagnostics. The proposal's own summary (the task title) could not be corrected before adoption, because the server on port 3000 runs pre-merge code. The post-merge commands correct it along with the dated summaries. Status stays In Progress until AC 5 is done.

After the merge and a restart of the dogfood server on the merged code, the eight current variants whose summaries named 2026-09-13 or a missing module were restated through semantic edit's summary field; ./bin/dogfood check reports no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An edit batch can restate the summary of the variant it lands on, in the same one write; historical and shelved variants refuse it. The dogfood vault's stale summaries are restated with it. Verified by the branching owner, the gate lanes and the dogfood check.
<!-- SECTION:FINAL_SUMMARY:END -->
