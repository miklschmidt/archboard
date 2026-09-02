---
id: TASK-143.08.06.02
title: Resolve named vault boards without open-session state
status: To Do
assignee: []
created_date: '2026-09-02 01:58'
updated_date: '2026-09-02 02:02'
labels: []
dependencies:
  - TASK-143.08.06.01
references:
  - src/runtime/engine/board-store.ts
  - src/runtime/engine/board-io.ts
  - src/runtime/engine/board-target.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
parent_task_id: TASK-143.08.06
priority: high
type: enhancement
ordinal: 266000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the persisted note, not transient server or browser registration, sufficient to address a board. Every content interface must resolve the explicit board key against the configured vault on demand and retain the existing synchronous read-modify-write and lock guarantees. Board creation becomes a persisted operation. Live panes are optional observers: successful commits may be broadcast to panes already showing the board, but pane availability, acknowledgement, disconnection, or backpressure cannot participate in the board transaction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With zero WebSocket clients and no prior board-open request, each existing named vault board is directly usable through representative read, query, change, inspection, branch, snapshot, import, export, and comparison production interfaces.
- [ ] #2 Creating a board atomically creates its canonical empty note, returns its persisted identity, and neither creates, selects, repoints, nor otherwise changes a browser pane.
- [ ] #3 A missing, ambiguous, malformed, or conflicting named note produces the same actionable domain refusal regardless of browser state; no command tells the caller to open a pane or board first.
- [ ] #4 Each board write still performs one synchronous locked read-modify-write against the note and returns the committed result; transient caches or registries cannot become an authority or create a second board document.
- [ ] #5 After commit, panes already showing the board can receive the resulting document, while no connected, disconnected, slow, or failing pane changes transaction success, ordering, latency bounds, or the persisted bytes.
- [ ] #6 Production-interface tests start with a vault-only note and zero browser clients, exercise the reachable success and failure states, and prove that direct board access preserves version, conflict, locking, and one-request-one-write invariants.
<!-- AC:END -->
