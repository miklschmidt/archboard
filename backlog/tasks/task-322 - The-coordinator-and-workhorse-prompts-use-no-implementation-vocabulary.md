---
id: TASK-322
title: The coordinator and workhorse prompts use no implementation vocabulary
status: To Do
assignee: []
created_date: '2026-09-23 22:57'
labels:
  - voice
  - coordinator
  - codex
dependencies: []
references:
  - src/runtime/codex-instructions/coordinator-developer-instructions.txt
  - src/runtime/codex-instructions/workhorse-developer-instructions.txt
  - src/runtime/codex-coordinator-tool-contract
priority: high
type: bug
ordinal: 554000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The developer instructions of both agents, the voice channel rule, the outcome report and the dynamic tool descriptions talk about "the host", "host-approved created-workhorse queue", "an exact active turn", epochs, child and operation identities, manifests and thread links. None of these is a concept the model can act on, and the user found the coordinator paragraph on workhorse tools unreadable. A rule that exists only because of plumbing (such as "do not invent a host, process, thread, turn, queue, approval, or realtime identity") is either enforced by the tools already or means nothing to the model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The prompts and tool descriptions both agents read name no host, epoch, child, manifest, operation identity or thread link
- [ ] #2 Every rule they keep is stated in terms of the user, the voice model, the coordinator, the workhorse, the boards and the tools, and each tool's description says when to use it
- [ ] #3 A rule that only restated what a tool already enforces is removed
<!-- AC:END -->
