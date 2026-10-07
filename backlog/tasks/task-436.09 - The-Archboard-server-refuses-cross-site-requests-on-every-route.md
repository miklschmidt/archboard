---
id: TASK-436.09
title: The Archboard server refuses cross-site requests on every route
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - server
dependencies: []
parent_task_id: TASK-436
priority: high
ordinal: 703000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`app.use(cors())` in `src/server/archboard/lib/application.ts:35` allows every origin and every method on every route. A preflight request from the origin `https://example.com` got `Access-Control-Allow-Origin: *` and the methods `GET,HEAD,PUT,PATCH,POST,DELETE`. So any web page open in the browser can read every board, start a run of the code check and send write requests to the server on 127.0.0.1. Only the routes of the code opener refuse another origin, with 403 `CROSS_ORIGIN_REFUSED` (`src/server/code-opener/lib/browser-csrf.ts`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The server sends no CORS header that allows another origin, and it refuses a cross-site request on every route with 403, as the code opener does
- [ ] #2 The pane that the server serves, the CLI and the agent tools still work
- [ ] #3 A test sends a request with another origin to a read route and to a write route, and each gets the refusal
<!-- AC:END -->
