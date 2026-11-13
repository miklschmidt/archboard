---
id: TASK-636
title: A recorded walkthrough narrates each beat instead of answering it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-13T20:11:00Z'
labels: []
dependencies: []
priority: high
ordinal: 1078000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since 2026-11-01 narrated recordings open beats as replies to the user: "Sure. It means", "It's basically saying", "Right, so you point an agent at a repo". Codex 0.166.0 hands each recorded beat to the V3 voice as a speakable session.context.append with no sender, so the voice reads it as the user's turn. Commit 5c3f5f2762 dropped the quoted heading from the recorded beat; every recording up to 2026-10-30 was handed the heading and narrated the system. The README explainer, pull-request and newcomer videos were recorded with the broken beat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recorded beat reaches the voice with its quoted heading and body, and never with its position
- [ ] #2 The recording prompt says what the voice says first, and the realtime voice tests pass
- [ ] #3 A real recording of each README narrated walkthrough opens every beat on the system, with no reply, acknowledgement or repeated instruction in its transcript
- [ ] #4 The README links the refreshed explainer, pull-request and newcomer videos
<!-- AC:END -->
