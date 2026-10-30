---
id: TASK-538.06
title: Demonstrate comparing two proposals on the Checkout and orders example
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-26T05:25:00Z'
labels:
  - compare
dependencies:
  - TASK-538.01
  - TASK-538.02
  - TASK-538.03
  - TASK-538.04
  - TASK-538.05
parent_task_id: TASK-538
type: task
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-538 is done when a person can do the whole comparison in the product. The Checkout and orders example of `scripts/readme-assets/evidence-fixture.ts` already has two competing proposals, so the demonstration needs no new proposal on the dogfood vault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On the Checkout and orders example, a person opens one proposal beside the other variant from the About page, reads the interface changes first, picks Orders in both panes, and reads the measures side by side
- [x] #2 Asked in the dock to design it a second way with the same behaviour, the agent branches a draft through the CLI
- [x] #3 A rejected draft is shelved by the agent with the person's reason, and the vault shows only CLI writes with doing lines
- [x] #4 The notes record the steps and what the person saw
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Demonstrate the whole comparison in the product on the Checkout and orders example that scripts/readme-assets/evidence-fixture.ts builds, on a take server over a copy of examples/web-shop with the shared Codex home. A browser script drives a dark 1920x1080 window the way a person does and takes a screenshot at each step.

1. About page of the current variant: Open beside One entry point. Pane B's Board tab: read the interface changes first. Pick Orders, which is picked in both panes, and read On each variant in both.
2. Dock: ask the agent to design the Orders interface a second way with the same behaviour, on a draft it branches through the CLI.
3. Dock: ask the agent to shelve Entry per job with the person's reason. Read the shelved row.
4. Read the agent's commands from its Codex session log and the take vault's files: only CLI writes, each with a doing line.

No board is affected: the task changes no code, and it adds no proposal to the dogfood vault (ADR 0030).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Demonstration on 2026-10-26, take server http://127.0.0.1:41233 over examples/web-shop with the Checkout and orders example (Initial current, drafts One entry point and Entry per job), dark theme, 1920x1080. Screenshots in /tmp/archboard-brainstorm/compare-demo/.

What the person did and saw:
1. About page of Initial: the Variants section lists One entry point and Entry per job, each with Open beside. Open beside on One entry point added pane B on that draft as one history entry (paneB=checkout and orders@bBzKbErd); pane A stayed active.
2. Pane B's sidebar, Board tab: 'Compared with Initial' leads with 'Interface changes 0, No container's interface changed', then 'Changed 1'. semantic compare says the same: no container's interface changed; the draft only adds Place order -> Save order, so Place order stops passing one call on.
3. Orders picked in pane A is picked in pane B. On each variant in both panes: Initial 1, 2, 2, 0, 1 (On screen in A), One entry point 1, 2, 2, 0, 0 (On screen in B), Entry per job 3, 0, 2, 0, 0. These equal semantic compare --beside.
4. Dock, 'Design the Orders interface ... a second way, with the same behaviour ...': the agent read the archboard skill, claimed the board, ran semantic branch --from Initial --as 'Validate then submit' (version 5 to 6), then semantic edit on it (6 to 7), checked, rendered, and released the claim. Its answer says that callers now validate and then submit, so they carry the two-step sequence. Both panes added the row Validate then submit 2, 1, 2, 0, 1 (pass-through: Submit validated order), which shows the knowledge it moves to callers. The CLI gives the same counts.
5. Dock, 'Shelve the Entry per job draft ... My reason: three entry points make every caller learn the order rules.': the agent ran semantic shelve with that reason (7 to 8). Both panes now show Entry per job with the shelved mark and 'Shelved: three entry points make every caller learn the order rules.' The navigator moved it under Earlier.
6. The Codex session log holds three board writes, each through the archboard CLI with --doing: 'Branching a second Orders interface from current', 'Drawing validation and submission as separate Orders entry points', 'Shelving Entry per job with the user's reason'. Its Python step wrote only files under /tmp. In the take vault only Checkout and orders.semantic.json changed, from version 5 to 8, with the shelving and its reason recorded.

No approval card appeared: the workbench ran every command of both turns without asking, so no command had to be approved or declined. The dock lists each command as the bash path ('/nix/store/...-bash-5.3p15/bin/bash -lc ...'), not the command itself; that is the dock's existing command row and not part of this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The whole comparison works in the product on the Checkout and orders example. From the About page a person opens One entry point beside Initial as one history entry. Pane B's Board tab first says that no container's interface changed. Orders picked in one pane is picked in both, and On each variant gives the same five measures as semantic compare --beside. In the dock, the agent branched a second design, Validate then submit, through the CLI, and its row appeared in both panes. It then shelved Entry per job with the person's reason, which the shelved row shows. The vault changed only through three CLI writes, each with a doing line. No code changed and no proposal was added to the dogfood vault.
<!-- SECTION:FINAL_SUMMARY:END -->
