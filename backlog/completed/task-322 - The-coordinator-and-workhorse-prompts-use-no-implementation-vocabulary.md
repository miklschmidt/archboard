---
id: TASK-322
title: The coordinator and workhorse prompts use no implementation vocabulary
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 22:57'
updated_date: '2026-09-23 23:15'
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
- [x] #1 The prompts and tool descriptions both agents read name no host, epoch, child, manifest, operation identity or thread link
- [x] #2 Every rule they keep is stated in terms of the user, the voice model, the coordinator, the workhorse, the boards and the tools, and each tool's description says when to use it
- [x] #3 A rule that only restated what a tool already enforces is removed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the coordinator developer instructions in the user's terms: no host, thread link, epoch, identity or callback words; "user" not "person"; the coordinator framed as the voice model's subconscious; each workhorse tool described by when to use it; pointing questions read the live canvas with the archboard CLI's browser panes command. Drop rules that only restated what the tools enforce (supplied identities).
2. Rewrite the workhorse developer instructions the same way.
3. Rewrite the descriptions in the three dynamic tool manifests (archboard_workhorse, archboard_voice, archboard_app) and the voice prompt's approval line.
4. Re-pin the reviewed digests (instructions and manifests) and run the instruction, tool-contract and thread-tool tests.
Out of scope, noted: tool refusal messages still name child epochs and identities (about 40 strings in codex-coordinator-tools and codex-workhorse-operations).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote the coordinator and workhorse developer instructions, the three tool manifests (archboard_workhorse, archboard_voice, archboard_app) and the voice prompt's approval line in the user's terms: no host, thread link, epoch, identity, manifest or callback; "user" throughout; the coordinator framed as the voice model's subconscious; each workhorse tool described by when to use it; pointing questions read the live canvas with the archboard CLI's browser panes command. Dropped the two identity rules the tools already enforce. Re-pinned five digests (two instructions, three manifests) and the reviewed snapshot fixture; the prose-mutation test now mutates the new text. Gate: type-check, build, modules 3378 pass; the system lane failed once on tests/system/canvas-state/doing-activity.test.ts (right pane got the ledger connect snapshot after its mark), which passed 5 of 5 runs alone and on the lane rerun (178 pass); repository and serial-browser lanes pass. Not done: tool refusal messages still name child epochs and identities (about 40 strings).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both agents' prompts and all their tool descriptions now speak in terms of the user, the voice model, the coordinator, the workhorse and the boards, with no host, epoch, identity or thread link, and each workhorse tool says when to use it. Verified by the full gate lanes (one timing flake in doing-activity, passing on rerun).
<!-- SECTION:FINAL_SUMMARY:END -->
