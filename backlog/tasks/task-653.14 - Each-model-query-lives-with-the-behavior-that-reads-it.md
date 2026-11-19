---
id: TASK-653.14
title: Each model query lives with the behavior that reads it
status: To Do
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T17:34:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.07
  - TASK-653.13
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 12 of the archboard-deepen run. Model queries (apps/web/src/ui/architecture-drawing/model-reader/access/clients) is wide (30 names): it holds the query of every model resource, though most have one reader elsewhere, and its reply reader repeats what candidate 11's contract now reads. Each single-reader query moves to its behavior, readReply calls the contract's reply reader, and the history query becomes one factory. The settled design, every decision and its reason: the "Candidate 12, Model queries: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-12-queries.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: Model queries (apps/web/src/ui/architecture-drawing/model-reader/access/clients) and the behaviors that receive its queries: reading/clients (history), branch footprint, refs, merge-base, code exports, source lines, publication, walkthrough, ui/application/clients (explanations), Picture supply (drawing preparation).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on Model queries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Model queries exports exactly architectureModelQuery, architectureRecordQuery, architectureSummaryQuery, architectureClaimsQuery, architectureCheckpointsQuery, architectureModuleQuery, retainedModuleQuery, readModel, historyQuery, ArchitectureReadError, vaultQueryKey, invalidateModelQueries(client, vault?) (absorbs invalidateVaultQueries) and architectureFeed (width 13); the key table, readReply and createFeedSocket are private; INTERFACE_WIDE clears
- [ ] #2 modelHistoryQuery moves to reading/clients/history.ts with history-on-selection.test.tsx, and the footprint, refs, merge-base, code exports, source lines, publication, walkthrough, explanation and drawing-preparation queries sit with their behaviors
- [ ] #3 readReply calls candidate 11's reply reader for its five model uses, and the other four uses read code-intel's history reply through historyQuery
- [ ] #4 historyQuery(vault, request, { key, accept? }) takes a request typed from code-intel's architectureHistoryRequestSchema and spells the query string itself, so no caller builds URLSearchParams; it owns the route, the refusal to ArchitectureReadError, the wrong-analysis sentence, the five freshness options and no-signal, while callers keep key tail, coherence check, refs filter and range ?? null through accept
- [ ] #5 A new test pins the history query string's field order, and every query key, request and refusal sentence is otherwise unchanged
- [ ] #6 No ADR; historyQuery's use of apps/web's decision-18 allowance is noted in the pull request if the check counts it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
