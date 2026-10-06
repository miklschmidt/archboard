---
id: TASK-367.13
title: 'A language server resolves code-check candidates, starting with TypeScript'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 15:05'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (1946895dc module and timing, df6501439 typescript move, a55cc7723 skip reasons, 71a4b3c0a resolution step, 9c4018633 code that runs, 7296721b4 and a251ed26a docs): src/runtime/language-servers (configuration.ts, languages.ts, connection.ts, server.ts, session.ts, position.ts, outline.ts; tests: a stand-in server fake-language-server.ts for protocol and lifecycle, and one owner against the real tsc --lsp); src/runtime/code-check/lib/resolution.ts and the resolution in evidence.ts, support.ts, anchor-kind.ts and check.ts; skip reasons language-server-missing and language-server-failed in src/shared/code-check; LANGUAGE_SERVER_TIMEOUTS (start 10 s, request 30 s, stop 2 s) in src/shared/timing/lib/code-check.ts, re-exported by timing.ts.

Decisions the ADR left open:
1. Placement: a module of its own, src/runtime/language-servers, beside code-facts. ADR 0046 says code-facts owns the servers, but a module cannot hold another (boundaries.md), and the parent asked for a client module. The code check sees only a question in code-facts terms (root, file, line, spelling) and locations back, never the protocol, a process or a position.
2. language-servers.json: each key a language, each value {command, args?} or false. A bare command is looked up on the PATH (Bun.which); a path names the program. A key that names no language, invalid JSON or an unreadable file turns every server off for the pass, said once per language as language-server-missing with the file and the reason. Read again on every pass, so no restart. No environment variable moves it (ADR); checkCode takes the table as a third parameter, by default this machine's file, and tests pass their own.
3. Languages: only typescript is a key today (.ts, .mts, .cts as typescript, .tsx as typescriptreact). Python and C/C++ defaults are left to TASK-367.14 and .15, which add a row to LANGUAGES in languages.ts.
4. Default TypeScript command: the native tsc of Archboard's own typescript package (@typescript/typescript-<platform>-<arch>/lib/tsc, resolved from Archboard's install), not bin/tsc: that wrapper replaces itself or runs a child, and the check must stop exactly the process it started. No TypeScript of the checkout runs.
5. Plugins: tsc --lsp loads none. The real-server owner gives a checkout a tsconfig plugin that installs itself in node_modules and writes a mark when loaded; no mark appears.
6. The client opens no file (no didOpen): tsc --lsp reads files from disk, and opening 600 files cost about 400 ms more. A server that needs didOpen (clangd) adds it with its row.
7. Position: code facts give a spelling and a line, never a column. The client finds the spelling on its line through ., ?. or !. with any space, then the last name as a whole word, and asks at the last name. A use on a line that holds neither is not asked.
8. What is asked: a use with an evidence kind that no import resolves and whose first name no import brings in, when the file defines its first name at module level (a candidate) or it is spelled through a value (a.b). A bare local, parameter or global is not asked: its definition is in the same function or outside the checkout. This cut 42,837 questions to 24,349 on the dogfood vault with the same findings.
9. An answer: the first location in a file Git lists in the checkout is a site, and evidence to it is resolved; only locations outside the checkout reach no part (no evidence); no answer, or no server, keeps today's reading (a module-level name stays a candidate, a value use gives none). The site is one line, since a server names a line and not an extent.
10. Code that runs (found on the dogfood vault): a use through a value mostly resolves to a member of its type (entry.name to an interface field; memory.remember() to the method the interface CodeFindingsMemory declares, not the one createCodeFindingsMemory returns). That made 10 undrawn warnings and one ANCHOR_MISMATCH that no right change clears. So a use at run time (call kind) counts only where the server's outline (textDocument/documentSymbol, once per file per pass) declares a class, function, method, constructor, variable, constant or enum exactly where the definition starts, and no interface holds it. A member of a type literal is not in the outline (it shares a line with its alias), so it does not count. A use only as a type counts wherever it lands.
11. anchor-kind: a use is resolved when the server names a definition (in or outside the checkout); otherwise a candidate as before. support: a symbol that code facts cannot follow is judged at the site the server names, by the same rule, so ANCHOR_MISMATCH now judges an anchor reached through a value.
12. Failures: an error answer to one request leaves the server in use. A timeout, an ended process or a failed start is language-server-failed once for that checkout, and the server is killed and never asked again in the pass, so a pass waits for a hung server at most once.
13. Lifecycle: one server per language and checkout, started on the first question; close() waits for every start, then shutdown and exit, kill after stopMs; a cancelled pass kills at once. checkCode closes in finally, so a cancelled request and a stop of the Archboard server end every server.
14. The answer is never cached across passes (ADR); within a pass each question and each outline is asked once.

Measured (design-checks.md, Resolving candidates with the TypeScript language server): warm pass in one process 853 to 974 ms without a server, 5,672 to 6,054 ms with it (candidates only: 3,948 to 3,997 ms). Real ./bin/dogfood check --code after a restart 9,083 ms, then 4,743 to 7,141 ms over five runs (before: about 1,400 ms warm), at a load average of about 7. Over src (1,447 non-test files): 12,438 candidates asked, 11,450 resolved to code (58 in another file than the name match), 384 to a type or data, 581 outside; 29,904 value uses asked, 139 resolved to code, 19,806 to a type or data, 9,885 outside.
Dogfood vault before and after (same code, same process): with the server one finding changed: Board rasterizer, Raster session -> DevTools connection, RELATIONSHIP_UNSUPPORTED is gone (the session calls a method of the connection it holds). No warning added or removed. No finding rested on a candidate before, so none moved from candidate to resolved.

Seam for TASK-367.14 to .16: add a row to LANGUAGES in src/runtime/language-servers/lib/languages.ts (extensions to languageId, and defaultServer: a ServerCommand, or a string that says why there is none, which is how C# and Swift run only from an entry in language-servers.json); the key joins language-servers.json automatically. resolution.ts and the session are language-neutral. A server that needs didOpen, a project file or an index adds that to server.ts or as a row field, and says a missing project file once (a new skip reason or the detail of language-server-missing).

Close: Archboard server@TASK-367.13 branched from CcqLAdE6; TASK-367.08 adopted after, so the change was restated as TASK-367.13 after TASK-367.08 (Language servers added, Code check description, Code check -> Language servers anchored at openLanguageServers in src/runtime/code-check/lib/resolution.ts, where the session opens after the build moved it out of check.ts), TASK-367.13 shelved with that reason, adopted at v91; the summary was set to the board's scope after adoption (v92), a step I missed before adopting. Footprint against base afa938914: namedAndChanged Code check and Language servers; changedNotNamed Code opener (a7d9b7302, TASK-367.08) and Code facts (4d782f721, 392193e9e, a665606e1 TASK-367.08; 7d0be472a TASK-368.10), none of this task's commits. ./bin/dogfood check: no diagnostics. Behind names none of this task's commits on any board.
<!-- SECTION:NOTES:END -->
