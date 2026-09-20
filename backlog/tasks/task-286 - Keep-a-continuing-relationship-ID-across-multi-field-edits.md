---
id: TASK-286
title: Keep a continuing relationship ID across multi-field edits
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-20 00:02'
labels:
  - semantic-board
  - identity
dependencies: []
priority: high
type: bug
ordinal: 500000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On Cloud Infrastructure, L4 forwarding is the same load balancer-to-IIS connection in Observed Infrastructure and both migration drafts. The agent stated its existing ID to change kind, but the board store refused because traffic had already diverged from the predecessor. It then removed and re-added the arrow, falsely recording a replacement and altering renderer placement. The user confirms that the ID should continue and wants a narrow correction without disrupting otherwise successful skill evaluations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Restating a held or restorable relationship ID can change multiple authored fields while preserving identity; invalid references and duplicate IDs remain refused.
- [ ] #2 Explicit remove plus add without an ID remains a replacement and comparison distinguishes continuation from replacement.
- [ ] #3 The Cloud Infrastructure migration drafts use original L4 forwarding ID ghAjlN21 with fallback kind and muted emphasis, while observed current retains HTTP; board comparison reports continuation.
- [ ] #4 Focused store and CLI contracts, consumer skill guidance and affected evaluation expectations, and complete check pass without weakening lint or type rules.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the two-property identity refusal with the existing explicit-ID continuation contract; align the replacement warning and focused tests. 2. Update only consumer skill and evaluation guidance directly affected by the rule. 3. Restart the canvas, restore the Cloud Infrastructure arrow ID through the CLI in one atomic edit, verify both drafts and comparison, then run the complete gate and commit source and board changes separately.
<!-- SECTION:PLAN:END -->
