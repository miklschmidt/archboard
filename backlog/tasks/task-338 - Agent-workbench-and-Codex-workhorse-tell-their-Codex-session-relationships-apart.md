---
id: TASK-338
title: >-
  Agent workbench and Codex workhorse tell their Codex session relationships
  apart
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 13:59'
updated_date: '2026-09-24 13:59'
labels:
  - architecture
dependencies: []
priority: medium
type: docs
ordinal: 579000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-24: on Agent workbench and Codex workhorse most relationships into Codex session ride one line and are hard to pair with their labels. The user's judgement: the board was modelled with the wrong tools. Relationships that differ in mechanism should say so through their configured kind (and so their colour), and through emphasis and traffic, rather than all being calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each relationship into Codex session on both boards has the kind its mechanism has, and emphasis and traffic where the source justifies them, each with a source line
- [ ] #2 Both boards drawn and looked at
- [ ] #3 ./bin/dogfood check reports no diagnostics
<!-- AC:END -->
