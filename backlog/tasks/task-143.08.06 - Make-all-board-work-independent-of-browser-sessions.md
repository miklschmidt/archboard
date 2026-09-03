---
id: TASK-143.08.06
title: Make all board work independent of browser sessions
status: Done
assignee: []
created_date: '2026-09-02 01:57'
updated_date: '2026-09-03 22:05'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0008-cli-is-the-default-surface.md
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
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
- [x] #1 With a configured vault and zero connected browser clients, every operation on a named existing board, including reads, writes, Mermaid conversion, board image rendering, and finding close-ups, works without a prior open, load, show, pane, selection, or camera step.
- [x] #2 The public CLI exposes browser-session inspection and manipulation only beneath `archboard browser`; board commands never consume or mutate pane, selection, focus, viewport, or browser-connection state, and browser commands never persist board content.
- [x] #3 Creating a board produces its persisted note without opening or changing a browser surface, and every later board command resolves the named vault note directly rather than requiring transient open-board registration.
- [x] #4 Named-board PNG or SVG output and Mermaid conversion run in a server-owned rendering boundary with Bun or Node emulation as the default; any headless Chromium fallback is justified by recorded fidelity or reliability evidence, isolated from the user session, and governed as a server runtime resource.
- [x] #5 When one or more browser panes display a changed board, they receive the committed result as an observable update, but an absent, disconnected, slow, or failing pane cannot fail, delay, or alter the board operation.
- [x] #6 The tracked `skills/archboard/` package, its references, and its evals teach browser-free board work as the main path and disclose `browser` commands only for live human-session observation or control; derived skill copies remain reproducible rather than authored.
- [x] #7 Repository policy and production-interface tests reject browser prerequisites or implicit live-session inputs on board commands, reject note writes from browser commands, and exercise both zero-client board workflows and explicit live-browser workflows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Prove zero-client named-board PNG, SVG, and Mermaid rendering, selecting an isolated server-owned Chromium fallback only after the emulation evidence records the material Mermaid defect.
2. Resolve named persisted boards directly from the vault, preserving atomic creation, synchronous locked writes, and post-commit best-effort pane observation.
3. Move persisted-board rendering, finding close-ups, and Mermaid conversion behind the server rendering boundary.
4. Hard-cut live pane, selection, viewport, and capture controls into explicit `archboard browser` commands without making a browser a board-work prerequisite.
5. Make the tracked Archboard skill, references, evals, and repository guidance teach the browser-free workflow first, with explicit browser collaboration only when needed.
6. Finalize only after mapping all seven parent acceptance criteria to the accepted focused child evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Finalization evidence map: AC1 is covered by TASK-143.08.06.02 vault-only board interfaces, TASK-143.08.06.03 zero-client renderer and findings owners, and TASK-143.08.06.05 configured-vault flow. AC2 and AC7 are covered by TASK-143.08.06.04 command-contract, zero-client, explicit-browser, and no-note-write evidence. AC3 and AC5 are covered by TASK-143.08.06.02 atomic persisted creation, direct resolver, lock, and acknowledgement-independent observer evidence. AC4 is covered by TASK-143.08.06.01 emulation-versus-isolated-Chromium proof and TASK-143.08.06.03 renderer lifecycle evidence. AC6 is covered by TASK-143.08.06.05 skill, eval, sync, and policy evidence. All five direct children are Done with checked criteria; Backlog recursion found no descendants. No broad validation was rerun because the accepted focused child owners directly exercise the seven parent interfaces.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-02 01:59
---
User decisions, 2026-09-02: use `archboard browser` as the obvious live-session namespace; resolve every named vault board lazily without a prior open or load step; prefer Bun or Node DOM and canvas emulation, but permit an isolated server-owned headless Chromium fallback if the proof finds material quirks or bugs; update the canonical tracked Archboard skill package; remove old command aliases rather than preserve the muddled surface.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the browser-independent board-work recovery. Accepted child evidence proves zero-client persisted-board operations and server rendering, the explicit `archboard browser` boundary, atomic named-board creation and non-blocking pane observation, and browser-free skills, evals, and policy checks. All five direct children are Done with checked criteria; no descendant tasks exist.
<!-- SECTION:FINAL_SUMMARY:END -->
