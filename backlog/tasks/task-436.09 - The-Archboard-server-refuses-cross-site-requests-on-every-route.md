---
id: TASK-436.09
title: The Archboard server refuses cross-site requests on every route
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:37'
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
- [x] #1 The server sends no CORS header that allows another origin, and it refuses a cross-site request on every route with 403, as the code opener does
- [x] #2 The pane that the server serves, the CLI and the agent tools still work
- [x] #3 A test sends a request with another origin to a read route and to a write route, and each gets the refusal
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proposal: Archboard server@TASK-436.09 (parent owns vault changes) extracts the existing browser CSRF rule into src/server/browser-origin.
2. Mount the shared general request guard before admission, parsers, static files and HTTP routes. Refuse foreign Origin/Referer and cross-site metadata without permissive CORS; preserve originless CLI and agent traffic. Keep code opener strict guards on the same policy owner.
3. Preserve the browser Host in Vite proxies so same-origin development traffic remains valid.
4. Add cheap policy owners and a production-composition read/write/static/preflight refusal owner with compatibility and unchanged-state evidence. Run focused tests and lint, simplify, and commit. Parent runs final gate and closes the task.

5. Apply the same shared origin policy before WebSocket upgrade acceptance, preserving same-origin pane and originless tool sockets. Parent approved this actual cross-site entry path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one server/browser-origin policy owner. Application mounts its general guard before mutation admission, parsers, static files and routes; the opener keeps its stricter browser proof through the same guard; WebSocket upgrades apply the same general verdict before acceptance. Removed permissive CORS middleware and unused direct cors dependencies. Vite proxies preserve the original Host so same-origin development traffic passes.
Focused evidence: 47 browser-origin/settings cases pass (1.69s), including foreign reads/writes/code checks/static/preflight/missing routes, parser precedence, untouched board bytes and no remembered check run; originless local writes/reads, own-origin reads/static/opener operations and sockets, and a preserved Vite Host. Root TypeScript and touched production/test lint pass after generating checkout-local Codex contract inputs. Existing doing-boundary owner also run to cover real CLI and agent write paths.
Simplification pass: retained two public seams (Express middleware and pure verdict for upgrades/tests), moved the existing stricter policy rather than copying it, and removed old Code opener re-exports and dead guard implementation. No additional route allowlists. Parent owns proposal/code-check, full gate, review and task closure; task remains In Progress.

Closing footprint: base 0d1078825c72e207141adb837cef574ab077d494. The proposal parent is TASK-433, BVuqb2cc. HTTP application, Code opener, Pane socket and Browser origin guard match commit c0412c4f7. The server container is covered by these children. Other unnamed changes belong to concurrent internal analysis work or the separate indexing and decoder proposals. No named part lacks its source change.

Final gate: bun run check exits 0 in 436 seconds with 4,597 passing tests, including the complete serial browser lane. Lint, formatting, root and frontend types, and builds pass. The refreshed server runs sixteen boards. The delivery code pass exits 0 with zero diagnostics and zero warnings. Complete gate log: /tmp/archboard-task436-final-check-2.log. Delivery evidence: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every HTTP route and WebSocket upgrade uses the same origin guard. Cross-origin requests receive 403 without permissive CORS headers. Served panes, originless CLI requests and agent tools still work. Focused read, write, upgrade and CLI tests and the full gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
