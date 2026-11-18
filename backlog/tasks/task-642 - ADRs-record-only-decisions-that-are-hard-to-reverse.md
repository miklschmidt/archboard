---
id: TASK-642
title: ADRs record only decisions that are hard to reverse
status: In Progress
assignee: []
created_date: '2026-11-17T02:54:00Z'
updated_date: '2026-11-18T20:08:00Z'
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
- [x] #1 Every ADR in docs/adr/ was read against the three ADR tests
- [x] #2 Passages that only describe functionality or UI behavior are removed, and the decisions, constraints, boundaries and non-obvious rejected options stay
- [x] #3 Status notes at the head of an ADR name no removed amendment
- [ ] #4 No link or ADR reference in the repository points at a removed section or a removed ADR
- [x] #5 The site build and the format check pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two passes cut docs/adr/ from 12,861 to 5,528 lines. Pass 1 (seven reviewers) removed UI behavior and functionality walkthroughs. Pass 2 (six reviewers) cut the 15 largest ADRs to their decisions, folded amendments into the main text and dropped task history. No ADR file was deleted, because about 720 files cite ADRs by number. A follow-up commit fixed about 150 citations in code comments, CONTEXT.md, docs and other ADRs. Still stale: four citations in .archboard/vault module descriptions (jLUi9ZuH ADR 0044, 0idmUHd2 ADR 0073, NFwqWgrm ADR 0071, cokLjwKT ADR 0061), which need a vault claim. Near-empty ADRs that could be deleted later: 0007, 0013, 0016, 0017, 0035, 0061, 0062. Checks: format:check passes, rustfmt on the 15 touched Rust files passes, lint:core-docs passes, the site builds and its links resolve.
<!-- SECTION:NOTES:END -->
