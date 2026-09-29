---
id: TASK-379
title: A workhorse's CLI talks to the Archboard server that started it
status: To Do
assignee: []
created_date: '2026-09-29 18:33'
labels:
  - codex
dependencies: []
priority: high
type: bug
ordinal: 663000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Codex child an Archboard server starts gets no ARCHBOARD_URL or ARCHBOARD_VAULT, so a workhorse's ./bin/archboard falls back to http://127.0.0.1:3000 and whatever vault that server holds. On 2026-09-29 a workhorse of a server on port 3404 with the vault /tmp/web-shop asked the server on port 3000 for the Web shop board and was refused twice with 'no semantic board', before it answered from the selection alone. Any server not on port 3000 hands its agents the wrong server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A workhorse's CLI reaches the Archboard server that started its Codex child and that server's vault, with no configuration in the repository
- [ ] #2 A test proves that the Codex child's environment names the server's URL and vault
<!-- AC:END -->
