---
id: TASK-143.08.06
title: Make all board work independent of browser sessions
status: To Do
assignee: []
created_date: '2026-09-02 01:57'
updated_date: '2026-09-02 01:59'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0008-cli-is-the-default-surface.md
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0015-the-note-is-the-board.md
  - src/cli/command-contract/contract.ts
  - src/runtime/engine/board-store.ts
  - skills/archboard/SKILL.md
parent_task_id: TASK-143.08
priority: high
type: task
ordinal: 264000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Separate persisted-board work from the optional live browser session before TASK-143 or TASK-144 feature work resumes. A configured vault and Archboard server must be sufficient to create, resolve, read, change, convert, inspect, and render a named board. Commands that inspect or manipulate panes, selection, focus, camera, or the live canvas belong only to an explicit `archboard browser` surface. Connected panes may observe committed board changes, but their presence and delivery never determine whether a board command succeeds. Server rendering prefers Bun or Node DOM and canvas emulation; an isolated server-owned headless Chromium process is permitted only when recorded evidence shows emulation is unreliable or materially incorrect, and it must never attach to or manipulate the user browser session. This recovery supersedes the pane-coupled mechanisms introduced by completed work while preserving their historical task records.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With a configured vault and zero connected browser clients, every operation on a named existing board, including reads, writes, Mermaid conversion, board image rendering, and finding close-ups, works without a prior open, load, show, pane, selection, or camera step.
- [ ] #2 The public CLI exposes browser-session inspection and manipulation only beneath `archboard browser`; board commands never consume or mutate pane, selection, focus, viewport, or browser-connection state, and browser commands never persist board content.
- [ ] #3 Creating a board produces its persisted note without opening or changing a browser surface, and every later board command resolves the named vault note directly rather than requiring transient open-board registration.
- [ ] #4 Named-board PNG or SVG output and Mermaid conversion run in a server-owned rendering boundary with Bun or Node emulation as the default; any headless Chromium fallback is justified by recorded fidelity or reliability evidence, isolated from the user session, and governed as a server runtime resource.
- [ ] #5 When one or more browser panes display a changed board, they receive the committed result as an observable update, but an absent, disconnected, slow, or failing pane cannot fail, delay, or alter the board operation.
- [ ] #6 The tracked `skills/archboard/` package, its references, and its evals teach browser-free board work as the main path and disclose `browser` commands only for live human-session observation or control; derived skill copies remain reproducible rather than authored.
- [ ] #7 Repository policy and production-interface tests reject browser prerequisites or implicit live-session inputs on board commands, reject note writes from browser commands, and exercise both zero-client board workflows and explicit live-browser workflows.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-02 01:59
---
User decisions, 2026-09-02: use `archboard browser` as the obvious live-session namespace; resolve every named vault board lazily without a prior open or load step; prefer Bun or Node DOM and canvas emulation, but permit an isolated server-owned headless Chromium fallback if the proof finds material quirks or bugs; update the canonical tracked Archboard skill package; remove old command aliases rather than preserve the muddled surface.
---
<!-- COMMENTS:END -->
