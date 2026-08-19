---
id: TASK-008
title: Rename the CLI and MCP server identity from mcp-excalidraw-server to archboard
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 15:01'
updated_date: '2026-08-19 15:45'
labels:
  - needs-triage
dependencies: []
ordinal: 8000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLI help, usage strings, and error messages say archboard
- [x] #2 MCP SERVER_NAME decision is deliberate: renaming may break existing client configs, so either rename with a note or keep and document why
- [x] #3 No user-facing output references the upstream package name
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Investigate SERVER_NAME: how it reaches the wire (initialize serverInfo + 2026-07-28 _meta stamp), whether MCP tool names are namespaced by it, and whether any config in this repo or on this box keys an mcpServers entry off it.
2. src/cli/run.ts — rename program name in help header, usage lines, per-command usage, unknown-command message, and the CliUsageError usage line. Drop the dead 'excalidraw-canvas' alias line (package.json now declares a single bin, 'archboard').
3. src/core/spawn.ts — unreachable-canvas error tells the user to run 'archboard start'.
4. src/bin.ts — fix the stale comment naming two bins.
5. src/core/scene-io.ts — exported .excalidraw scenes stamp source: 'archboard' (artifact metadata the user commits; nothing reads it back).
6. SERVER_NAME decision in src/core/mcp-server.ts: rename or keep, with the reasoning recorded in notes. Update scripts/check-mcp-stdio.mjs assertions to match whichever is chosen.
7. Leave wire-identity strings alone and say why: CANVAS_SERVICE_NAME ('mcp-excalidraw-canvas') is a /health handshake marker never printed by any command, and the pidfile state dir ('excalidraw-canvas') would orphan a running server's pidfile if renamed. Both are out of scope for user-facing output.
8. skills/excalidraw-skill/ — replace every 'npx -y mcp-excalidraw-server' invocation (SKILL.md, frontmatter description, references/cheatsheet.md, evals/evals.json) with the real invocations, and drop the 'npm i -g excalidraw-canvas' alias and 'installed from npm' framing, since the package is private. Keep the skill path-free.
9. skills/archboard-dev/SKILL.md — update the portability note that names the old npx invocation.
10. Update the CLAUDE.md known-gap line that tracks this task.
11. Verify: bunx tsc, bunx vite build, bun run test, then exercise ./bin/canvas help, help export, an unknown command, and a usage error. Grep to confirm no user-facing string still says mcp-excalidraw-server, leaving README provenance and docs/adr/0001-0002 upstream references intact.
12. node scripts/sync-skills.mjs
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## SERVER_NAME decision: RENAMED to 'archboard'

Investigated before deciding. Where the name actually goes:
- src/core/mcp-server.ts feeds it to the McpServer constructor as serverInfo.name. It reaches clients in exactly two places: the 2025-era 'initialize' result's serverInfo, and the per-result '_meta' serverInfo stamp on the 2026-07-28 era. Nothing else in the repo reads SERVER_NAME (grep: two hits, the declaration and that one use).
- MCP tool names are flat — 'create_element', 'batch_create_elements', … in src/core/mcp-tools.ts. The protocol does not namespace tools by server name, so renaming cannot change a tool name.
- The 'excalidraw/*' prefix in skills/excalidraw-skill/SKILL.md does NOT derive from SERVER_NAME. That prefix is a client-side display convention built from the key the user gives the server under 'mcpServers' in their client config. A client entry keyed 'excalidraw' keeps showing 'excalidraw/*' after this rename. The skill wording was misleading, so it now tells the agent to match on tool names and says the prefix depends on the client's config key.
- Nothing keys off the old name: no .mcp.json in the repo, no 'mcpServers' block in any tracked file, and ~/.claude.json has an empty mcpServers for every project scope on this box including this one. The package is private and was never published, so there are no external installs either.

Conclusion: the rename is free. Blast radius is one cosmetic string — the name an MCP client displays for this server changes from 'mcp-excalidraw-server' to 'archboard'. No user has to edit any config; the 'mcpServers' key and every tool name are unchanged. Keeping the old value would have meant the handshake advertising a package name that does not exist. Reasoning is recorded as a comment above the constant so the next reader does not have to redo the investigation, and summarised in a new 'Names on the wire' section in CLAUDE.md.

Updated scripts/check-mcp-stdio.mjs (2 assertions) to match; the wire checks pass and a live 'initialize' returns {"name":"archboard","version":"0.1.0"}.

## Deliberately NOT renamed (with reasons)

- CANVAS_SERVICE_NAME = 'mcp-excalidraw-canvas' (src/core/canvas-client.ts:277, echoed by /health in src/server.ts). This is a wire handshake the CLI uses to prove it is not talking to a foreign service squatting on port 3000, and to make 'stop' refuse to signal an unrelated process. No command prints it — 'status' builds its own JSON and never forwards health.service — so it is not user-facing. Renaming would make a new client refuse an already-running old server for no user benefit.
- The 'excalidraw-canvas' pidfile state directory (src/core/pidfile.ts). Renaming it orphans the pidfile of any server currently running, so 'stop' would stop finding it. Not user-facing.
- The 'excalidraw-canvas-theme' localStorage key (frontend/src/App.tsx). Renaming silently discards the user's saved theme.
- 'Never bun add mcp-excalidraw-server' in CLAUDE.md and skills/archboard-dev/SKILL.md — a correct reference to the upstream npm package, which is the point of the warning.
- README provenance section and docs/adr/0001, 0002 — legitimate upstream references, left untouched (no blanket sed was used anywhere).

## Changes

- src/cli/run.ts — help header, both usage lines, per-command usage, unknown-command hint, and the CliUsageError usage line all say 'archboard'. Dropped the 'excalidraw-canvas <command>  Same CLI under its short alias' line: package.json declares a single bin ('archboard'), so that alias no longer exists. Added a short note that ./bin/canvas runs the local dist/ build inside the checkout and that there is nothing to install from npm.
- src/core/spawn.ts — unreachable-canvas error now says: Start it with `archboard start` (`./bin/canvas start` in the repo) or `node dist/server.js`.
- src/bin.ts — stale comment claiming two package bins now names the single one.
- src/core/mcp-server.ts — SERVER_NAME -> 'archboard' plus the decision comment.
- src/core/scene-io.ts — exported .excalidraw scenes stamp source: 'archboard'. This is metadata the user commits alongside code; nothing reads it back (single write site, no readers).
- src/server.ts — comment referencing the dead 'excalidraw-canvas stop' alias.
- scripts/check-mcp-stdio.mjs — two serverInfo.name assertions.
- skills/excalidraw-skill/ — every 'npx -y mcp-excalidraw-server' occurrence replaced with 'archboard' (SKILL.md x8 incl. the frontmatter description, references/cheatsheet.md x2, evals/evals.json x1). Rewrote the Step 0 interface block: it now offers './bin/canvas' inside the checkout and 'archboard' outside, says the package is private so there is nothing to npx, drops the 'npm i -g excalidraw-canvas' alias, and stops claiming the MCP tools carry an 'excalidraw/*' prefix. Skill stays path-free and portable.
- skills/archboard-dev/SKILL.md — the portability note that named the old npx invocation.
- CLAUDE.md — moved this item out of Known gaps into Closed, and added a 'Names on the wire' section recording which identity strings changed and which kept the old spelling and why.
- node scripts/sync-skills.mjs run: 2 authored skills re-synced into .agents/skills/ with .claude/skills/ symlinks.

## Verification

bunx tsc: clean. bunx vite build: built. bun run test: 5/5 MCP stdio wire checks pass + loopback-bind check passes.

$ ./bin/canvas help
archboard 0.1.0 — Excalidraw architecture canvas for AI coding agents
Usage:
  archboard                  Run the MCP stdio server (for MCP clients)
  archboard <command> [...]  Drive the canvas from the command line
  … (command table unchanged)
Run `archboard help <command>` for per-command usage.

$ ./bin/canvas help export
Usage: archboard export [--out scene.excalidraw | note.excalidraw.md] …

$ ./bin/canvas frobnicate
Unknown command "frobnicate". Run `archboard help` for the list.   (exit 2)

$ ./bin/canvas update
Error: Usage: update <id> --set '{"backgroundColor": "#ffc9c9"}'
Usage: archboard update <id> --set '{"backgroundColor":"#ffc9c9"}'   (exit 2)

$ EXCALIDRAW_NO_AUTOSTART=1 EXPRESS_SERVER_URL=http://127.0.0.1:39997 ./bin/canvas describe
Error: Canvas server is not reachable at http://127.0.0.1:39997 (auto-start disabled by EXCALIDRAW_NO_AUTOSTART=1). Start it with `archboard start` (`./bin/canvas start` in the repo) or `node dist/server.js`.   (exit 3)

MCP handshake (live stdio initialize, 2025-06-18):
serverInfo: {"name":"archboard","version":"0.1.0","description":"Programmatic canvas toolkit for Excalidraw with file I/O, image export, and real-time sync"}

Export: $ ./bin/canvas export -> {"type":"excalidraw","version":2,"source":"archboard",…}

Final grep over tracked sources: the only remaining 'mcp-excalidraw-server' / 'excalidraw-canvas' hits are the four intentional ones listed above plus this task file. No user-facing string carries the upstream package name.

Orchestrator verification: ./bin/canvas help reports 'archboard 0.1.0'; MCP SERVER_NAME is 'archboard'; no user-facing occurrence of the old name remains in src/ or scripts/ once the deliberate 'never bun add mcp-excalidraw-server' warnings and upstream provenance references are excluded. bun run test green.

Separately fixed three stale doc claims found while reviewing: CLAUDE.md still listed 'Selection never leaves the browser' as a gap after TASK-004 shipped; the archboard-dev skill still told readers describe ignores customData in a section titled 'Things that will mislead you'; and its verification example used flat customData, contradicting ADR 0003's namespacing. The example now also exercises selection and promote.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CLI help, usage, and errors identify as archboard, as does the MCP serverInfo handshake and the source stamped into exported scenes. SERVER_NAME was renamed after investigating: tool names are flat and never namespaced by server name, the excalidraw/* prefix derives from the client's own mcpServers key rather than serverInfo, and nothing on this machine keys off the old value — so the blast radius is one cosmetic display string. Two internal handshake identities deliberately keep the old spelling and are documented in CLAUDE.md.
<!-- SECTION:FINAL_SUMMARY:END -->
