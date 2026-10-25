---
id: TASK-543
title: Research storage for shared architecture and a hosted service
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25T21:25:00Z'
updated_date: '2026-10-25T21:42:00Z'
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
- [ ] #1 The report preserves the existing semantic model and states requirements for canonical ownership, graph queries, proposals, history, concurrency and hosted tenant isolation.
- [ ] #2 The report compares mature and emerging storage options using dated primary sources, with licensing, hosting, maintenance, costs and material limitations.
- [ ] #3 The report recommends a shortlist and explains native versus application-owned versioning, including a concrete evaluation workload and migration risks.
- [ ] #4 A design document records the agreed discovery, interaction and agent-explanation direction, with unresolved choices marked separately.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the agreed discovery and interaction direction in docs/design/architecture-discovery-and-interaction.md before storage research. No architecture board is affected because this task records research and adopts no implementation change.
2. Record current semantic-model contracts and hosted storage requirements, then research independent technology families in parallel. Include Dolt, which the owner named.
3. Synthesize a comparison, recommendation, migration implications and a bounded evaluation plan in docs/design/architecture-storage-research.md, with focused supporting notes.
4. Make sure that citations and factual claims agree, complete the repository gate required for task closure, and commit the research and task record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner asked to preserve the agreed UX model before research and named Dolt as a candidate. The design note records those inputs without changing shipped behavior or adopting a database.

The owner prefers DoltgreSQL over MySQL-compatible Dolt. Prioritize DoltgreSQL and assess PostgreSQL compatibility, maturity, branching, merge behavior and hosted operation independently of Dolt.

The synthesis and four focused technology reports are complete. The report prioritizes DoltgreSQL, compares TerminusDB and hosted PostgreSQL, and screens native graph, temporal, multimodel and newer options. A disposable DoltgreSQL 1.4.0 run passed recursive reads, branch isolation and disjoint merge, exposed a same-field conflict, and demonstrated that SQL constraints alone allow a containment cycle. The reproduction and outputs are in docs/design/architecture-storage/doltgresql-smoke.md. The owned server stopped cleanly. All seven authored Markdown files pass focused formatting and local links resolve. The full repository gate found additional formatting and renderer timing failures; remaining lanes and failure reproducibility are being collected without changing unrelated files.
<!-- SECTION:NOTES:END -->
