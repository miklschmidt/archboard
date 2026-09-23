---
id: TASK-323
title: 'Rename the canvas server and bin/canvas, and stop calling the server the host'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 23:08'
updated_date: '2026-09-23 23:34'
labels:
  - naming
dependencies: []
references:
  - CONTEXT.md
  - package.json
priority: medium
type: chore
ordinal: 555000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server that runs the boards, the browser connection and Codex was called the "canvas server", a name carried over from the Excalidraw MCP fork, and the launcher script was bin/canvas (installed as the archboard command through package.json). Canvas is the glossary term for the pannable surface in the browser, so the name said the wrong thing, and docs and prompts also called the same server "the host". User decision 2026-09-24: it is the Archboard server, and the launcher is bin/archboard. This task covers the glossary, the launcher and all prose (docs, skills, help and log text, comments, test data). Code identifiers are TASK-324. The dogfood board named "Canvas server" can only be renamed once boards can be (TASK-281).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CONTEXT.md defines the Archboard server, with canvas server and host under Avoid
- [x] #2 Docs, skills, help and log text, comments and test data say Archboard server and never canvas server, and the docs people and agents read never call the server the host
- [x] #3 The launcher is bin/archboard, and package.json, bin/dogfood and every documented command use it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. CONTEXT.md: Archboard server entry.
2. git mv bin/canvas bin/archboard; package.json bin, bin/dogfood, src/bin.ts, the spawn target, help text, tests and docs.
3. Replace canvas server with Archboard server in prose outside backlog/, the vault boards and the frozen skill-eval baseline; fix articles and the lowercase listing key.
4. Replace host meaning the server in the living docs (DESIGN, TESTING, INSTALL, README, AGENTS, CONTEXT, skills, .archboard/README, docs/agents).
5. Node names on dogfood boards that say Canvas server, through the CLI; the board of that name waits for TASK-281.
6. Gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: CONTEXT.md defines the Archboard server (Avoid: canvas server, canvas, host, backend). bin/canvas is bin/archboard (git mv); package.json bin, bin/dogfood, src/bin.ts, the spawn target and help text, the skill, README, INSTALL, TESTING, AGENTS, the voice acceptance doc and seven system test launchers use it. "canvas server" became "Archboard server" in 51 tracked files (docs, ADRs, the skill example, help and log text, comments, test data), excluding backlog history, the frozen skill-eval baseline and the vault boards. Three DESIGN.md sentences that called the server the host now say Archboard server; host stays where it means the HTTP Host header, a git or repository host, build files or the renderer environment. The outline test's expected order changed because the renamed test board sorts first. Re-pointed ~/.local/bin/archboard at bin/archboard. Gate: type-check and build pass, modules and system lanes pass on rerun after the outline fix, repository and serial-browser lanes pass. The vault board named Canvas server and the node that opens it wait for TASK-281.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The server is the Archboard server in the glossary, docs, skills, help and log text, comments and test data, and the launcher is bin/archboard. Code identifiers are TASK-324; the vault board and its node wait for board renames (TASK-281). Verified with the full gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->
