---
id: TASK-077
title: 'Scratch gets a home in the vault, and a canvas with no vault says what it does'
status: To Do
assignee: []
created_date: '2026-08-20 20:16'
labels: []
dependencies:
  - TASK-061
references:
  - src/core/board-store.ts
  - src/core/library.ts
  - src/core/board.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0004-obsidian-vault-as-persistence.md
type: enhancement
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 8 of docs/design/the-plan.md, and a prerequisite for the task that dismantles the in-memory board store.

THE PROBLEM. The canvas boots holding a `scratch` board so a first run has something in front of it. It is a board like any other except in one way: it is `vaultBacked: false` and has no file, and `src/core/board-store.ts:72-76` seeds it in memory. Under ADR 0015 board content in a process is exactly what is forbidden, so scratch either gets a home or it is the one board the ADR does not cover, and one exception is how a rule stops being a rule.

WHERE. `<vault>/.archboard/scratch.excalidraw.md`, following the precedent already set by the library at `src/core/library.ts:56`: alongside the boards but out of the way, because Obsidian hides dot-directories so the vault's note list stays notes.

WHAT STAYS TRUE. Scratch keeps every property it has now. It is addressed as `--board scratch` like any other board. `board save --board scratch --as <name>` still gives it a home under a real name, and that is still what promotes it from somewhere to put things to a board somebody meant. A pane opened with nothing else on screen still shows it.

THE OPEN QUESTION, AND IT HAS TO BE ANSWERED HERE. `ARCHBOARD_VAULT` is deliberately unset by default, because the vault spans repositories and there is no sensible default (CLAUDE.md, ADR 0004). Today the canvas boots and shows scratch with no vault set, and only board-shaped commands fail, through `requireVaultRoot` at `src/core/board.ts:194`. Under ADR 0015 there is nowhere to put scratch's elements, so a canvas with no vault has nowhere to put anything. Three answers and none is obviously right:

- The canvas refuses to start without a vault. Honest, and it turns a soft first-run experience into a hard error.
- Scratch falls back to the state directory, next to the pidfile. Keeps the first run working, and introduces a second place boards can live.
- Scratch stays in memory as a documented exception. Keeps everything working and puts a hole in ADR 0015 on day one.

Pick one, write it into ADR 0015 or a new ADR, and say what a first-time user sees. Do not leave it to whoever picks up the store work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The scratch board is persisted at <vault>/.archboard/scratch.excalidraw.md and survives a server restart
- [ ] #2 Scratch is still addressed as --board scratch, and board save --board scratch --as <name> still gives it a name
- [ ] #3 What a canvas with no ARCHBOARD_VAULT does is decided, implemented, and recorded in an ADR
- [ ] #4 A first run with no vault set produces a message that says what to do, not a stack trace
<!-- AC:END -->
