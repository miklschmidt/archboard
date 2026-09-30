---
id: TASK-324
title: 'Code names say Archboard server, and host only where it means something else'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 23:24'
updated_date: '2026-09-24 01:38'
labels:
  - naming
dependencies:
  - TASK-323
priority: low
type: chore
ordinal: 556000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-323 renamed the canvas server to the Archboard server in prose, code still names it after the canvas and the host: the src/server/canvas module, canvas-client and canvas-spawn-target in the engine, CANVAS_SERVICE_NAME, CanvasCodexWorkbenchHost, canvas-codex-host, src/shared/codex-realtime-host, and about 1,400 uses of host in 360 files. Host also has other meanings there (the renderer's environment, the HTTP Host header, a repository host), which keep their names. CANVAS_SERVICE_NAME is what the CLI checks to tell its own server from a foreign service, so changing it makes a new CLI treat an old server as foreign until it restarts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Modules, types, functions and constants that mean the Archboard server are named after it
- [x] #2 Host remains only where it means the renderer environment, the HTTP Host header or a repository host
- [x] #3 Comments follow the same names
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move modules and files named after the canvas or host that mean the Archboard server (src/server/canvas -> src/server/archboard, engine canvas-* -> server-*, shared/canvas-startup-terminal, shared/codex-realtime-host, tests/system/canvas-state and owned-canvas support), rewriting imports, package.json lanes, lint config and doc paths. Commit.
2. Rename exported and local identifiers that mean the server (canvas -> server, host -> server or what the thing is); CANVAS_SERVICE_NAME -> ARCHBOARD_SERVICE_NAME with value archboard-server. Commit.
3. Sweep comments, test names, log and error text and model-facing text for canvas and host meaning the server. Commit.
4. Gate lanes one at a time; list stale vault code bindings for the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Naming decisions (TASK-324):
- The short identifier word for the Archboard server is server (serverPid, startOwnedServer, SERVER_* timing constants); Archboard only where server alone is ambiguous (ARCHBOARD_SERVICE_NAME, src/server/archboard, user- and model-facing text says Archboard server).
- CanvasCodexWorkbenchHost is CodexWorkbenchServer (codex-workbench-server.ts); canvas-codex-host.ts is codex-wiring.ts after its codexWiring export; codex-workbench-canvas-link.ts is codex-workbench-server-link.ts.
- RealtimeHost is RealtimeServer and src/shared/codex-realtime-host is codex-realtime-contract: six of its seven members are calls into the server's realtime session. The UI's browser proxy of it (media-host.ts) is lib/realtime.ts with createRealtimeServer; the name is short so media-owner.ts stays under the 600-line limit.
- The spoken-approval ClassifierTurnHost and ValidationHost were context objects built by the gate, so they are ClassifierTurnContext and ValidationContext.
- Host stays where it means the renderer's environment, the HTTP Host header, a network host or bind address, a repository host, Codex's own network fields, hosted login or CI, a fake browser media or playback host, and the environment an embedder hands an embedded module or component (PaneHost, PaneCoreHost, WorkbenchHost, VoiceHost, StreamHost, SocketRunHost, processCommandHost, React host components). That last group is the renderer-host sense, not the server.
- Values: the health service is archboard-server (accepted: an older running server reads as foreign until restarted). In-process and same-version values follow (startup pipe tag and serverPid field, workbench owner name, thread-link key, host_* causes and authority labels, test markers and log names, skill-eval server.log). Kept unchanged as public or on-disk contracts: CLI and HTTP error codes CANVAS_UNREACHABLE, CANVAS_BUSY, CANVAS_STOPPING; the canvases directory under CODEX_HOME; the canvas key in skill-eval run.json.
- Model-facing text: the workhorse and app manifests (this canvas), the classifier prompt (the host) and the Codex clientInfo title (archboard canvas) say Archboard server; three reviewed digests re-pinned, as TASK-322 did.
- The package script that runs the server is server (was canvas); skill setup looked for bin/canvas after TASK-323 and now looks for bin/archboard.
- Not edited (instructions files, for the owner): AGENTS.md lines 79-80 and .claude/rules/agent-work.md line 7 still say canvas for the server.

Gate (worktree, after the last code commit): type-check pass; lint pass; fmt:check pass; test:modules 3378 pass 0 fail; test:system 178 pass 0 fail; test:repository 8 pass 0 fail; test:serial-browser 15 files, 17 pass 0 fail. Environment note: this worktree's fresh install of @chenglou/pretext 0.0.9 lacks setMeasureFunction that src/ui/voice-subtitles/tests uses; the main checkout's node_modules copy has it, so it was copied in (ignored node_modules only). Vault code bindings to renamed paths are listed for the parent to update through the CLI.

Merged into main (6222d6eb) with the conflicts resolved to main's logic and the rename map applied to the code that landed meanwhile (TASK-321, TASK-281, the model rename). Gate on the merged tree: all lanes exit 0 (3584 tests). Open for the user: UI embedder names that say host (PaneHost, WorkbenchHost, VoiceHost and others), and the public error codes CANVAS_UNREACHABLE, CANVAS_BUSY and CANVAS_STOPPING.

User decisions 2026-09-24: the UI embedder types are PaneCallbacks, Workbench, VoiceStore, PaneCorePorts, SocketRunPorts and StreamPorts (OpenerSettingsHost became OpenerSettings), and the CANVAS_* error codes are SERVER_*. RendererHost and the test fakes of browser media and playback hosts keep host in its other meaning. Browser lane and module tests pass after the rename (9eedce62, 5e0c0383).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code names say the Archboard server: the src/server/archboard module, server-named engine files and identifiers, ARCHBOARD_SERVICE_NAME archboard-server, SERVER_* error codes, and UI embedder types named for what they hold. Host remains only for the renderer environment, the HTTP Host header, network and repository hosts and test fakes. Verified by the full gate lanes after each step.
<!-- SECTION:FINAL_SUMMARY:END -->
