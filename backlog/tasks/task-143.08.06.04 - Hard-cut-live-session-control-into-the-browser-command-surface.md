---
id: TASK-143.08.06.04
title: Hard-cut live session control into the browser command surface
status: To Do
assignee: []
created_date: '2026-09-02 01:58'
updated_date: '2026-09-02 02:02'
labels: []
dependencies:
  - TASK-143.08.06.02
  - TASK-143.08.06.03
references:
  - src/cli/command-contract/contract.ts
  - src/cli/commands/run.ts
  - docs/design/cli-command-audit.json
  - docs/adr/0008-cli-is-the-default-surface.md
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08.06
priority: high
type: enhancement
ordinal: 268000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the public command boundary teach the architecture. Persisted-board work remains in explicit named-board commands. Every command whose purpose is to inspect or manipulate the connected user session moves beneath `archboard browser`, including panes, displayed boards, selection, camera, and capture of what the person currently sees. Remove the old spellings in the same cutover so compatibility aliases cannot preserve two overlapping mental models. Keep named-board server rendering distinct from browser capture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The released command inventory classifies every path as a board operation, browser operation, or neither, and only paths beneath `archboard browser` may require a connected browser client or inspect or manipulate pane, selection, focus, viewport, or displayed-board state.
- [ ] #2 Pane inventory and lifecycle, displayed-board changes, live selection reads, camera control, and capture of the current rendered session are available only through coherent `archboard browser ...` subcommands; their help states the connected-session prerequisite and visible effect.
- [ ] #3 Named-board rendering is a board operation that explicitly names the board and has no pane or camera option; browser capture explicitly names its live target and cannot be mistaken for persisted-board rendering.
- [ ] #4 No `board` command opens, selects, repoints, or creates a pane. Showing a named board is an explicit browser command, while creating and later addressing the board remain browser-free.
- [ ] #5 Every board write that targets elements requires explicit stable element identities or another board-domain selector. Promotion and demotion no longer fall back to live selection; `browser selection` exposes identities that callers may deliberately pass to a later board command.
- [ ] #6 Board inventory reports persisted-board facts only. Browser inventory reports panes and what they display; no `onScreen` or equivalent session field leaks into the board result contract.
- [ ] #7 Old top-level pane, panes, selection, viewport, and session-screenshot spellings and pane-changing board options are removed rather than aliased, and every removal produces concise replacement guidance.
- [ ] #8 The CommandContract registry and generated command audit enforce the classification: no board command carries a browser prerequisite or session input, no browser command writes a note, and all browser-requiring commands live under the browser namespace.
<!-- AC:END -->
