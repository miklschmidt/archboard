---
id: TASK-579.04
title: A release server listens on 27242 and the browser opens archboard.localhost
status: To Do
assignee: []
created_date: '2026-11-05T14:58:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/workspace/src/runtime/services/source-checkout.ts
  - packages/workbench/src/server/services/listener-address.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1025000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release has no git checkout, so the port rule falls back to 3000, where the main checkout server listens, and the two refuse each other. Chrome and Firefox resolve every `*.localhost` name to loopback themselves (RFC 6761), but the system resolver does not on every Linux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In release mode the server listens on 127.0.0.1:27242, and a set `ARCHBOARD_URL` or `--url` still decides
- [ ] #2 Every address shown to a person or opened in a browser is `http://archboard.localhost:27242`; the CLI itself connects to 127.0.0.1
- [ ] #3 A page served at archboard.localhost works: panes, sockets, the core and the painter load
<!-- AC:END -->
