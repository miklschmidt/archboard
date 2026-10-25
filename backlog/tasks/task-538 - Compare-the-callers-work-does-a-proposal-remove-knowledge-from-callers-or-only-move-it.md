---
id: TASK-538
title: >-
  Compare the caller's work: does a proposal remove knowledge from callers or
  only move it
status: To Do
assignee: []
created_date: '2026-10-25T17:03:00Z'
labels:
  - compare
  - ui
dependencies: []
documentation:
  - >-
    docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md
  - docs/adr/0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md
  - .claude/skills/codebase-design/DESIGN-IT-TWICE.md
priority: high
type: feature
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Design it twice (Ousterhout, and the codebase-design skill) compares competing interfaces for one module. The CLI already does this: `semantic compare` lists interface changes first, and `--beside` puts the interface measures of competing proposals side by side (ADR 0044). The browser shows none of it. It shows no interface change, nothing links the two panes, and a proposal is not opened beside the current variant from the places that list proposals.

The owner decided on 2026-10-25 to keep TASK-388: the Board tab lists no variants. A proposal opens beside from the About page and the navigator.

Demonstrate with `examples/web-shop` or the Checkout and orders example that `scripts/readme-assets/evidence-fixture.ts` builds, which already has two competing proposals. The dogfood vault then carries no proposal that nobody will build (ADR 0030).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person opens a proposal beside the current variant, reads its interface changes first, picks a part in both panes and reads both panes through one view, without the CLI
- [ ] #2 Nothing ranks proposals or marks a winner
<!-- AC:END -->
