---
id: TASK-367.13
title: 'A language server resolves code-check candidates, starting with TypeScript'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 13:43'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 621000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tree-sitter matches names, so two methods with one name give a false candidate. A language server resolves each candidate to its real definition. Servers are separate programs that a machine may not have, so the check must work without them and say so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The check starts a language server over stdio, resolves each candidate with a definition request, and reports it as resolved or as a candidate
- [ ] #2 When the server is not installed, the check says so once and reports candidates
- [ ] #3 The server command for each language can be configured, and TypeScript works first
- [ ] #4 Every server the check started has stopped when the check returns
- [ ] #5 The added time on the dogfood vault is measured and recorded in the design note
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.13 adds Language servers (src/runtime/language-servers) beside Code facts and Code check, and Code check -> Language servers (call, anchored at openLanguageServers in src/runtime/code-check/lib/check.ts). No other board draws the code check.
1. New runtime module src/runtime/language-servers (a module cannot hold another, so it sits beside code-facts; the code check sees only a definition question and its answer, never the protocol): configuration.ts reads <stateDir>/language-servers.json (per language: {command, args} or false), with defaults: typescript runs the native tsc of Archboard's own typescript package with --lsp --stdio; a bare command is looked up on the PATH. connection.ts speaks JSON-RPC with Content-Length framing over the child's stdio, answers server requests with null, bounds each request. server.ts spawns, initializes, asks textDocument/definition, and stops (shutdown, exit, then SIGKILL after a bound). session.ts is one pass: one server per language and checkout started on its first question, answers kept for the pass, what was unavailable said once, close() stops every server it started, also on abort. position.ts finds the column of a spelling on its line.
2. Timing: LANGUAGE_SERVER_TIMEOUTS (start, request, stop) in src/shared/timing/lib/code-check.ts, re-exported by timing.ts.
3. Shared: skip reasons language-server-missing (not installed, turned off, or the file invalid; once per language) and language-server-failed (started and did not answer; once per checkout and language).
4. Code check: resolution.ts maps an answer to a site in a Git-listed file of the checkout. evidence.ts asks for each use with an evidence kind that no import resolves and whose first name no import brings in; a site makes resolved evidence, a definition outside the checkout makes none, no answer keeps today's candidate. anchor-kind.ts marks a use resolved when the server answers. support.ts judges ANCHOR_MISMATCH for a symbol reached through a value once the server names its definition. check.ts opens the session per pass and closes it in finally.
5. package.json: typescript 7.0.2 moves from devDependencies to dependencies; bun.lock follows.
6. Tests: a fake LSP server fixture (Bun script) for protocol, missing, failure, timeout, abort and every server stopped; one test against the real tsc --lsp (resolves through the @/ alias, loads no plugin from the checkout); code-check owner: a candidate becomes resolved, a value use gains evidence, a missing server is said once and candidates stay.
7. Docs: INSTALL.md (language-servers.json), authoring.md, generate:skill-artifacts, design-checks.md (measured added time on the dogfood vault, before and after counts), cli-command-audit.json if the check help changes.
8. Run ./bin/dogfood check --code before and after; close the proposal per archboard-dev.
<!-- SECTION:PLAN:END -->
