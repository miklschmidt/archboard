---
id: TASK-143.08.06.05
title: Teach and prove the browser-free Archboard workflow
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 10:18'
labels: []
dependencies:
  - TASK-143.08.06.04
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/architecture-workflow.md
  - skills/archboard/references/cli-workflows.md
  - skills/archboard/evals/evals.json
  - skills/archboard-dev/SKILL.md
  - TESTING.md
  - INSTALL.md
  - docs/agents/test-suite.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08.06
priority: high
type: task
ordinal: 269000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the browser-independent contract impossible to miss for agents, maintainers, and users, and verify it through the interfaces they actually use. Rewrite the canonical tracked Archboard skill package so board work is the unconditional main path and live browser collaboration is a clearly disclosed optional branch. Align repository guidance and replace skill eval assumptions that currently require panes for Mermaid, ordinary drawing, completion screenshots, or board status. Finish with focused zero-client and explicit-browser production workflows; real-browser fixed-point tests remain for actual browser fidelity, not as a product prerequisite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The tracked `skills/archboard/SKILL.md` main path begins with an explicit named board and works start to finish without discovering, opening, or capturing a pane; live human-session reading and control appear in one clearly triggered `archboard browser` branch.
- [ ] #2 `skills/archboard/references/architecture-workflow.md`, `cli-workflows.md`, and `cheatsheet.md` consistently distinguish persisted-board inspection and server rendering from browser panes, selection, camera, and capture; Mermaid is described as server conversion and no completion gate requires a browser unless the requested evidence is specifically about the live session.
- [ ] #3 The Archboard skill evals include a zero-browser workflow that creates and changes a board, converts Mermaid, renders board evidence, inspects, saves, and exports it, plus a separate browser-collaboration workflow that deliberately exercises the `browser` namespace; no eval accidentally treats a pane as a board prerequisite.
- [ ] #4 AGENTS.md, TESTING.md, INSTALL.md, CLI help, and the tracked archboard-dev guidance state that only `archboard browser` workflows and real-browser fidelity checks require a connected browser, while screenshots or renders of named board content are server-owned.
- [ ] #5 Running the documented skill synchronization reproduces generated `.agents` and `.claude` copies from `skills/` without treating those derived copies or rendered proof artifacts as authored files.
- [ ] #6 A production-interface workflow with a configured vault and zero WebSocket clients creates a board, writes elements, converts Mermaid, renders PNG and SVG, renders live findings when present, inspects, branches or snapshots, exports, and reads the final note without an open/load/show prerequisite.
- [ ] #7 A separate real-browser workflow proves that browser commands inspect or manipulate only the explicit live target and do not change note bytes, while an ordinary board write still becomes visible in panes already showing that board without depending on their acknowledgement.
- [ ] #8 Focused repository, contract, system, and retained real-browser fidelity checks pass under the memory-safe validation mechanism established by TASK-143.08.01; failures are fixed rather than bypassed or weakened.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the tracked archboard skill main path and references so an explicit named board proceeds through create, write, Mermaid conversion, server rendering, inspection, save or branch, and export without a pane; isolate all live observation and control in one clearly triggered browser-collaboration branch.
2. Replace the stale eval workflows with one explicit zero-browser production workflow and one separate browser-collaboration workflow, then align AGENTS.md, TESTING.md, INSTALL.md, CLI help, archboard-dev guidance, and test-suite ownership language.
3. Deepen the existing vault-only production-interface owner for the complete zero-client flow. Add browser-command target and note-byte assertions to the existing two-pane browser owner, and add acknowledgement-independent board-update visibility to the existing server-update owner without creating another browser owner or browser start. Add only the cheapest repository assertion needed to keep the skill/eval split explicit.
4. Build only the renderer prerequisite, run focused repository/contract/system owners and exact retained browser test selectors, apply scoped formatting and lint, run the documented skill sync, and audit that derived skill copies and proof artifacts remain untracked and reproducible. Record exact test/runtime/process counts and leave all acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the browser-free teaching and verification cut. Canonical skills/ now starts with an explicit named-board workflow and isolates live panes under one browser-collaboration branch; evals tag one zero-browser workflow and one browser-collaboration workflow. Aligned AGENTS.md, TESTING.md, INSTALL.md, archboard-dev guidance, test-suite ownership, and root CLI help.
Verification reuses existing owners: one new repository-policy assertion, an expanded vault-only system case, and added assertions inside the existing selection-inspector and server-update-ordering browser owners. No new browser owner or browser start was added. The zero-client case uses one server, one retained renderer, 11 supervised CLI invocations, and zero WebSocket clients; it passed in 4.71s. Exact retained browser selectors passed in 12.55s and 8.29s. CLI help passed in 3.63s; skill policy passed in 0.08s; browser-selector policy passed in 0.04s. Scoped Oxlint, Oxfmt, and diff checks pass.
The documented skill sync reproduced .agents/skills/archboard and the .claude symlink byte-for-byte from skills/archboard. Both derived trees and dist/frontend are ignored and untracked. No proof artifact is authored. Acceptance criteria remain unchecked as requested.
<!-- SECTION:NOTES:END -->
