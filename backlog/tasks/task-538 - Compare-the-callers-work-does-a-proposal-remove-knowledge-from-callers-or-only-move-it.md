---
id: TASK-538
title: >-
  Compare the caller's work: does a proposal remove knowledge from callers or
  only move it
status: Done
assignee: []
created_date: '2026-10-25T17:03:00Z'
updated_date: '2026-10-26T05:25:00Z'
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
- [x] #1 A person opens a proposal beside the current variant, reads its interface changes first, picks a part in both panes and reads both panes through one view, without the CLI
- [x] #2 Nothing ranks proposals or marks a winner
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Every subtask is Done, each with its own browser QA and owners. TASK-538.06 ran the whole comparison in the dark browser on the Checkout and orders example without the CLI: Open beside from the About page, pane B's Board tab leading with the interface changes, Orders picked in both panes, both panes reading the Overview view (a view chosen in one linked pane is read in both, owned by TASK-538.03's tests), and On each variant equal to semantic compare --beside. No surface ranks proposals or marks a winner: interface changes list in the variants' order, and On each variant marks only the variant on screen.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser now compares proposals the way semantic compare does (design it twice, ADR 0044). A proposal opens beside the current variant from the About page or the navigator as one history entry, and reads through the view of the pane it came from. Its Board tab says first what it changes about each container's interface. Two panes on one board are linked: a part picked or a view chosen in one is picked or read in both. A picked container shows its five interface measures on every current, draft and shelved variant side by side. Nothing ranks proposals. TASK-538.06 demonstrated the whole comparison, plus a second design and a shelving by the dock agent through the CLI.
<!-- SECTION:FINAL_SUMMARY:END -->
