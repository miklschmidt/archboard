---
id: TASK-124
title: Delete the MCP server and make Archboard CLI-only
status: Done
assignee:
  - '@codex'
created_date: '2026-08-26 00:01'
updated_date: '2026-08-26 02:56'
labels: []
dependencies: []
references:
  - docs/adr/0008-cli-is-the-default-surface.md
  - src/bin.ts
  - src/index.ts
  - src/core/mcp-server.ts
  - src/core/mcp-tools.ts
  - src/core/mcp-dispatch.ts
  - src/core/injection.ts
  - scripts/check-mcp-stdio.mjs
  - scripts/check-surface-parity.mjs
  - INSTALL.md
  - TESTING.md
  - DESIGN.md
  - skills/archboard/SKILL.md
  - skills/archboard/references/cheatsheet.md
  - tasks/task-119
  - tasks/task-120
  - tasks/task-121
  - tasks/task-122
  - tasks/task-123
priority: high
type: task
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete Archboard MCP as a public transport and make the schema-driven CLI the sole agent command surface. Remove the stdio entry point, tool catalogue, dispatcher, server factory, MCP package dependencies, MCP-only tests, CLI-to-MCP parity machinery, installation instructions, skill tables, and compatibility exports. Invoking archboard with no command must behave as a normal CLI invocation and show help rather than opening a JSON-RPC transport.

This task does not delete or rename the canvas application server. Preserve the Express and WebSocket API, browser renderer, vault-direct operations, frontend, and REST interface used by the CLI and application code. Preserve the deliberately retained internal mcp-excalidraw-canvas health identity and excalidraw-canvas state directory documented in AGENTS.md; they are compatibility identifiers, not evidence that an MCP server remains.

Before removing mcp-dispatch.ts, identify any product behavior implemented only inside it and either delete behavior that existed solely for MCP or move reusable domain behavior behind the CLI and REST boundaries without copying it. Remove MCP as a caller/session category where it no longer represents a real caller, while preserving protocol-neutral no-working-directory behavior needed by other surfaces.

MCP was also used as a heuristic for choosing which Codex task receives board-change injection. Delete that signal and its configuration. Do not replace it with recent activity or a sole loaded task as if either were board ownership. Until an exact board-to-task identity exists, automatic delivery must require explicit deterministic routing and otherwise decline to inject.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running archboard with no arguments shows normal CLI help and exits normally; no invocation path starts an MCP stdio server or reserves stdout for JSON-RPC.
- [x] #2 The MCP server factory, stdio entry point, tool schemas, tool dispatcher, MCP compatibility exports, and direct @modelcontextprotocol dependencies are deleted, and the lockfile contains no dependency retained solely for Archboard MCP.
- [x] #3 Any non-transport product logic found in the MCP dispatcher is either moved once into an existing or deeper core module used by surviving surfaces, or explicitly deleted as MCP-only behavior; no CLI handler is rebuilt by copying dispatch arms.
- [x] #4 The Express and WebSocket canvas server, REST API, frontend browser renderer, vault and board behavior, CLI auto-start, and source-built Bun workflow continue to work without MCP modules in their import graph.
- [x] #5 The internal /health service identity mcp-excalidraw-canvas and excalidraw-canvas state directory remain unchanged as required compatibility strings, while user-facing help and documentation contain no claim that Archboard offers MCP.
- [x] #6 MCP-based Codex-task attribution and ARCHBOARD_MCP_SERVER_NAME are removed. Board-change injection requires an explicit deterministic task route and declines ambiguous delivery; recent activity and a sole loaded task are not described or tested as board ownership.
- [x] #7 package.json, test-suite registration, INSTALL.md, TESTING.md, DESIGN.md, ADR 0008, relevant ADR consequences, the tracked Archboard skill, cheatsheet, evals, and synchronization checks are revised to describe the CLI-only product and the reason MCP was retired.
- [x] #8 TASK-119 through TASK-121 contain no MCP-equivalent acceptance criteria or implementation steps; TASK-122 teaches CLI-only workflows; TASK-123 generates and validates only the surviving CLI contract and intentional REST asymmetries.
- [x] #9 MCP stdio and CLI-to-MCP parity tests are deleted or replaced by schema-contract, CLI-surface, REST-boundary, injection-routing, and full-suite checks that prove no public behavior or invariant was accidentally lost.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit every MCP tool dispatch arm against the CLI, REST routes, and core modules; classify the two MCP-only tools and preserve protocol-neutral no-cwd behavior.
2. Delete the stdio entrypoint, server factory, tool catalogue, dispatcher, MCP-only state, direct dependencies, compatibility exports, and parity/stdio checks; make the package bin always invoke normal CLI help or a command.
3. Remove MCP task attribution from injection so only ARCHBOARD_INJECT_THREAD can select a target, then replace heuristic tests with deterministic-routing and CLI-contract checks.
4. Revise source comments, scripts, package suite registration, public docs, ADR consequences, the tracked Archboard skill, cheatsheet, and evals for the CLI-only product while preserving the two internal compatibility identities.
5. Reconcile TASK-119 through TASK-123 through the Backlog CLI, sync the tracked skill, run focused checks and the broad sequential suite, audit inherited TASK-125 changes, then commit only TASK-124 work and hand it to the parent for review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pre-deletion dispatcher audit: the parity inventory maps every non-aggregate tool to an existing CLI entry whose handler already calls the same REST or core module. The dispatcher contains transport parsing, response prose, and duplicated promotion/demotion write orchestration, not unique domain behavior. The MCP-only read_diagram_guide returns tracked skill text and will be deleted as transport-only. The MCP-only get_resource aggregate returns theme/viewport defaults or elements already available through query, describe, export, selection, and panes; its process-local sceneState has no surviving writer and will be deleted. Protocol-neutral callers without a working directory remain represented by promote.resolveBinding caller context and tests, renamed away from MCP.

Implementation progress: removed the stdio entrypoint, MCP factory/catalogue/dispatcher/state, direct protocol dependencies, compatibility exports, and MCP-only/parity checks. The package bin now always enters the CLI and a schema-driven CLI surface check proves no-argument help. Injection no longer observes MCP or activity/loaded-task heuristics: it refuses to arm without an exact ARCHBOARD_INJECT_THREAD and sends only to that route. Focused CLI, change/injection, doing, repositories, and one-write checks pass. Public docs, ADR consequences, suite docs, tracked skill, cheatsheet, eval, and TASK-119 through TASK-123 are reconciled; authored skills sync cleanly.

Validation evidence: test:cli (138 checks), test:changes, test:doing, test:one-write (76), test:repos, test:install (78), test:suites (26/26 registered), frontend build, formatting check, dependency/source scans, and git diff check pass. The full registered behavioral suite was run sequentially: all TASK-124-owned and end-to-end flows pass, including lock, labels, boards behavior beyond one harness assertion, branch/side-by-side, staleness, versioning, human performance, fixed-point behavior beyond one harness assertion, typing, and live session. In this inherited pre-integration TASK-125 snapshot, type-check/module-scope and three textual harness assertions remain red because TS7 removed the old compiler AST API and oxfmt changed source spellings those tests match. The parent reports those compatibility fixes are already reconciled; per protected scope this worker did not duplicate them. Lint remains at the expected TASK-125 structural baseline and was not weakened.

Post-reconciliation validation of commit 174aa199 against the reviewed TASK-125 snapshot: type-check passes; CLI, injection/change, doing, one-write, repos, suite registration, formatting, frontend build, boards, and fixed-point browser checks pass. Direct no-argument invocation exits 0 with help and no stderr. Source/import/dependency scans find no MCP implementation or protocol package; the required health and state-directory identities remain. The module-scope and hot-reload harnesses still have pre-existing TS7/oxfmt source-parser assumptions and are the only recorded integration limitations.

Parent integrated the CLI-only delta and TypeScript 7 harness remediation. bun run test passes the complete 26-suite chain in the merged checkout, including CLI contract, module-scope, hot reload, fixed-point, typing, performance, and live-session checks. High review found missing declared-bin/subcommand/public-invariant coverage plus four dead MCP-era helpers/comments; remediation is routed back to the TASK-124 worker before finalization. Final reconciled commit will supersede the intermediate hash recorded above.

Final integrated validation: the CLI-only tree passes bun run test across all 27 registered suites, including the four browser checks run sequentially; bun run type-check, frontend build, formatter checks, dependency/import scans, skill sync, and diff hygiene also pass. Independent fixed-range Standards and Spec reviews are REVIEW_CLEAN at e9ba0965886f0365aaee063f5d3334247b0921fc. The later TASK-125-only lint changes do not alter TASK-124 behavior.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 01:43
---
READY_FOR_REVIEW: implementation and exact reconciled commit validated; no push performed.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the MCP stdio server, schemas, dispatcher, compatibility exports, protocol dependencies, and MCP-only tests; made Archboard CLI-only with normal no-argument help and an exhaustive schema-driven CLI contract check. Injection now requires an explicit task route, while the REST/WebSocket canvas, browser, vault behavior, and required internal compatibility identities remain. Verified by the complete 27-suite chain, type-check/build/format scans, and clean independent Standards and Spec reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
