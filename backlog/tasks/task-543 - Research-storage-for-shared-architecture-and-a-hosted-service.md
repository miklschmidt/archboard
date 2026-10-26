---
id: TASK-543
title: Research storage for shared architecture and a hosted service
status: Done
assignee:
  - '@codex'
created_date: '2026-10-25T21:25:00Z'
updated_date: '2026-10-25T22:26:00Z'
labels: []
dependencies: []
references:
  - https://github.com/dolthub/dolt
  - https://github.com/dolthub/doltgresql
documentation:
  - docs/design/architecture-discovery-and-interaction.md
  - docs/design/architecture-storage-research.md
type: spike
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compare storage technologies for Archboard as a hosted service. Keep the existing semantic model of modules, containment, relationships, flows and proposals. The current board ownership and flat JSON persistence create overlap and unclear subject ownership. Assess graph databases, versioned and temporal databases, relational alternatives, and newer hosted technologies using primary sources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The report preserves the existing semantic model and states requirements for canonical ownership, graph queries, proposals, history, concurrency and hosted tenant isolation.
- [x] #2 The report compares mature and emerging storage options using dated primary sources, with licensing, hosting, maintenance, costs and material limitations.
- [x] #3 The report recommends a shortlist and explains native versus application-owned versioning, including a concrete evaluation workload and migration risks.
- [x] #4 A design document records the agreed discovery, interaction and agent-explanation direction, with unresolved choices marked separately.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the agreed discovery and interaction direction in docs/design/architecture-discovery-and-interaction.md before storage research. No architecture board is affected because this task records research and adopts no implementation change.
2. Record current semantic-model contracts and hosted storage requirements, then research independent technology families in parallel. Prioritize DoltgreSQL as requested by the owner.
3. Synthesize the comparison, recommendation, migration implications and evaluation plan in docs/design/architecture-storage-research.md, with focused supporting notes.
4. Validate sources, local links, formatting and the disposable DoltgreSQL experiment. Record repository-wide failures separately and commit the research and task record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner asked to preserve the agreed UX model before research and named Dolt as a candidate. The design note records those inputs without changing shipped behavior or adopting a database.

The owner prefers DoltgreSQL over MySQL-compatible Dolt. Prioritize DoltgreSQL and assess PostgreSQL compatibility, maturity, branching, merge behavior and hosted operation independently of Dolt.

The synthesis and four focused technology reports are complete. The report prioritizes DoltgreSQL, compares TerminusDB and hosted PostgreSQL, and screens native graph, temporal, multimodel and newer options. A disposable DoltgreSQL 1.4.0 run passed recursive reads, branch isolation and disjoint merge, exposed a same-field conflict, and demonstrated that SQL constraints alone allow a containment cycle. The reproduction and outputs are in docs/design/architecture-storage/doltgresql-smoke.md. The owned server stopped cleanly. All seven authored Markdown files pass focused formatting and local links resolve. The full repository gate found additional formatting and renderer timing failures; remaining lanes and failure reproducibility are being collected without changing unrelated files.

Validation result: lint, type-check and frontend build passed. System tests passed (257 tests) and repository tests passed (142 tests). Module tests recorded 4,898 passes, one skip and two timing failures. A focused rerun reproduced Agent workbench (track) at 3,070 ms against its 3,000 ms first-layout bound; Board viewer passed on rerun. The serial-browser aggregate exited 143 after three owners; the remaining owners completed through the documented focused adapter, for all 19 owners and 27 tests passing. The initial full gate stopped on formatting: four in-progress research reports plus 60 third-party skill files under .agents/skills. All seven authored documents now pass focused formatting, and local links resolve. Logs: /tmp/archboard-task543-check.log and /tmp/archboard-task543-wide-boards.log. No unrelated files were changed and no second full gate ran. Research commits: 39fded909 and 1d6ca1a5f. TASK-543 stays In Progress with acceptance boxes unchanged because archboard-dev requires a passing full gate before task closure. The requested research and UX record are available for the owner to evaluate; no database was selected or adopted.

The owner requested removal of the blanket full-gate requirement from archboard-dev. The skill now requires checks that cover the changed behavior and records any unrelated failures. The research acceptance criteria are all supported by the committed documents and experiment. The earlier repository-wide failures remain recorded and are not claimed fixed. This removes the sole task-closure blocker.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the agreed discovery and interaction model, researched hosted storage candidates, and documented a reproducible DoltgreSQL experiment. The report recommends evaluating DoltgreSQL against TerminusDB and hosted PostgreSQL while preserving the semantic model. Sources, local links and formatting were validated. The experiment exercised recursive reads, branch isolation, merging and conflict reporting. Repository-wide failures remain recorded outside the research scope. No database or product change was adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
