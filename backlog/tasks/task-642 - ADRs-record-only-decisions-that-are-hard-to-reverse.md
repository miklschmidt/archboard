---
id: TASK-642
title: ADRs record only decisions that are hard to reverse
status: In Progress
assignee: []
created_date: '2026-11-17T02:54:00Z'
labels: []
dependencies: []
ordinal: 1084000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Many ADRs in docs/adr/ restate basic functionality and UI behavior (what a view shows, when it reads, which keys it has) as if they were architectural decisions. The ADR 0045 amendment of 2026-11-13 for TASK-633 is one example. That text costs every reader time, ages faster than the code and DESIGN.md, and hides the real decisions. The test for what stays is in .claude/skills/domain-modeling/ADR-FORMAT.md: hard to reverse, surprising without context, and the result of a real trade-off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every ADR in docs/adr/ was read against the three ADR tests
- [ ] #2 Passages that only describe functionality or UI behavior are removed, and the decisions, constraints, boundaries and non-obvious rejected options stay
- [ ] #3 Status notes at the head of an ADR name no removed amendment
- [ ] #4 No link or ADR reference in the repository points at a removed section or a removed ADR
- [ ] #5 The site build and the format check pass
<!-- AC:END -->
