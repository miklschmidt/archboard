---
id: TASK-367.04
title: 'Relationships and flow steps carry an anchor, and a binding can name a symbol'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 10:33'
labels:
  - code-check
  - semantic-model
  - skill
dependencies:
  - TASK-367.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 612000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Evidence rule 3 of the consumer skill makes an agent record a file and a symbol for every relationship and flow step. The record is discarded, because the relationship schema has no field for it (`src/shared/semantic-board/lib/content.ts`, `views.ts`). A binding names a file but not the symbol or resource address inside it, so nothing can tell whether the file still holds what the part claims. The ADR of the decision task names the fields. The same symbol field holds a resource address for infrastructure, such as `module.checkout.aws_lambda_function.api` or `Deployment/checkout`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A relationship and a flow step accept an optional anchor, and a binding accepts an optional symbol, in the persisted schema and the agent input
- [ ] #2 Comparison treats an anchor as bookkeeping and ignores it (ADR 0023). A changed binding symbol is a changed binding
- [ ] #3 Reconciliation carries an anchor like other authored fields, and restating a relationship without its anchor does not lose it silently
- [ ] #4 Every reader of a binding honours the symbol or says that it ignores it. The inspector shows the symbol
- [ ] #5 The consumer skill writes the evidence record into the payload, one recipe's worked example shows an anchor, the generated schemas are regenerated, and the eval inputs and `coverage.json` row are updated
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Schema: CodeAnchorSchema {repo, path, symbol} (all required, nonempty) beside CodeBindingSchema in src/shared/code-target; CodeBindingSchema gains optional symbol. SemanticEdgeSchema and FlowStepSchema (persisted) and SemanticEdgeInputSchema and FlowStepInputSchema (agent input) gain optional anchor. Contract version stays 2.4.0 (additive fields, ADR 0036/0037 precedent).
2. Write boundary: edges already carry the stated input whole; buildStep in edit-views.ts carries a step's anchor. New store lib dropped-anchors.ts: an edge or step that had an anchor and is restated by the batch without one gets an ANCHOR_DROPPED write notice (path edges.<id>.anchor / flows.<flow>.steps.<step>.anchor), returned beside RELATIONSHIP_* notices from editContent.
3. Comparison: COMPARED lists stay as they are (anchor absent, binding compared by value so a symbol change is a binding change); tests prove both and the comment says why anchor is absent.
4. Reconciliation: anchor added to MERGED.edge and TOLD_FIELDS.step; tests for inherit, keep, competing-field and deleted-and-changed.
5. Readers of a binding: plain check (bindings.ts) tests the path only; code opener (routes.ts, resolver-core.ts) and GitHub fallback (presentation.ts) open the file and say they ignore the symbol until TASK-367.25; inspector (GoDeeper CodeRow) shows the symbol under the path; part search matches the symbol.
6. Consumer skill: evidence rule 3 writes the record as anchor; runbook step 6, catalogue relationship/binding rows, step key list, planning paragraph (a sentence is not an anchor, description holds intent); authoring.md bindings symbol, relationships anchor, ANCHOR_DROPPED warning; create-architecture worked example carries anchors and binding symbols; create-sequence mentions step anchors. bun run generate:skill-artifacts. evals: S00 edge.anchor + binding.symbol features, S07 step.anchor, rubric rows, coverage.json rows; bun run eval:skill check.
7. Board proposal: Board persistence@TASK-367.04 adds the Dropped anchors part (dropped-anchors.ts) and the edge from Edit semantic content. No other board draws the touched modules' wiring.
8. Gate lanes one at a time; commit by path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: Board persistence@TASK-367.04 branched (v21) and drawn (v22): Dropped anchors part + edge from Edit semantic content. The vault file also holds TASK-368.04's uncommitted draft (another agent), so the vault file is committed once only my hunks remain or with the closing.
Decision: the contract version stays 2.4.0. ADR 0046 is silent; ADR 0036 and ADR 0037 keep the version for additive optional fields, and moving it rewrites every board of every vault on its first read.

TASK-368.04 adopted a container redraw (v24) under my first proposal. Shelved Board persistence@TASK-367.04 (PARENT_SUPERSEDED would refuse it) and redrew the change as Board persistence@"TASK-367.04 redrawn" (a shelved variant keeps its name, so the new proposal needs another): Dropped anchors inside Board store, called by Edit semantic content. compare reports exactly that.
<!-- SECTION:NOTES:END -->
