---
id: TASK-302.07
title: Voice hears what the person picks while the agent is working
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 04:05'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: medium
type: bug
ordinal: 529000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while making the conversation canvas-wide (TASK-302.06): pane news (ADR 0034) is refused as stale_link whenever the workhorse thread status (for example active) differs from the status its link had when it was bound, because liveLinkMatchesCallback in src/runtime/codex-coordinator-callbacks/lib/delivery-authority.ts compares the whole link snapshot, status included. The status is presentation of the thread, not its identity. With one pane or two, the voice model therefore stops hearing where the person is looking exactly while the agent works — the moment it matters most.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While a workhorse turn runs, a hand-made pick in a pane reaches the live voice session as pane news
- [ ] #2 Callback and pane-news authority still refuse a link whose identity changed: another thread, child, epoch or revision
- [ ] #3 An owner covers delivery across a thread status change and the refusal across an identity change
<!-- AC:END -->
