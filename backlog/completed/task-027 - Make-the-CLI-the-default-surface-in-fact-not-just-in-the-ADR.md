---
id: TASK-027
title: 'Make the CLI the default surface in fact, not just in the ADR'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 22:08'
updated_date: '2026-08-19 22:27'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 27000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The excalidraw skill tells an agent to use the CLI first, not MCP
- [x] #2 Something fails when the MCP surface drifts behind the CLI, rather than the drift going unnoticed
- [x] #3 The image-in-context gap MCP covers is written down where someone deciding between them will read it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite excalidraw-skill Step 0: CLI first (auto-starts the canvas), MCP as the fallback for a client with no shell, REST last; keep the one honest MCP advantage (screenshots return as image content, where the CLI writes a PNG to read back). Fix the stale MCP asides in the body and the cheatsheet's MCP table (header claims 26, lists 31, real count is 35 — get_selection/get_panes/promote_selection/demote_selection missing).
2. Make the CLI surface machine-readable: export the command table from src/cli/run.ts with declared subcommands, sourced from a const in each subcommand-bearing module (board/arrange/snapshot/library/inject) that the dispatcher validates against, so a new subcommand cannot exist without appearing in the const.
3. scripts/check-surface-parity.mjs, in the check-*.mjs idiom: an explicit CLI-entry <-> MCP-tool mapping (42 CLI entries against 35 tools, since some commands take a subcommand), plus CLI_ONLY and MCP_ONLY allowlists whose entries each carry a reason. Fails on: a tool with no command, a command with no tool, a stale mapping/allowlist entry, a declared tool with no dispatch arm, a tool missing from the skill cheatsheet. Prints both allowlists on success so the asymmetries stay visible instead of silent.
4. Wire it into bun run test as test:parity (package.json, additively, at the end).
5. Verify: check passes as-is; then add a CLI command with no tool and a tool with no command and confirm the message names each gap; bun run test, bun run type-check, node scripts/sync-skills.mjs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill: rewrote Step 0 so the CLI is first ("use it whenever you can run a shell") and MCP is "the way in for a client with no shell", keeping the one real MCP advantage — get_canvas_screenshot returns the image as content, where screenshot writes a PNG to read back. Same length as before. Also fixed the frontmatter description, the '(CLI shown; MCP tools are 1:1)' heading (the mapping is not 1:1), and the cheatsheet's MCP table, which claimed 26 tools, listed 31, and was missing get_selection, get_panes, promote_selection and demote_selection. Synced with node scripts/sync-skills.mjs.

Parity: scripts/check-surface-parity.mjs, wired in as test:parity. Both sides come from code — tools from dist/core/mcp-tools.js, and a new cliSurface() export in src/cli/run.ts that reads the command table as data. Subcommands come from a const in each module that the dispatcher validates against up front (arrange OPERATIONS, snapshot ACTIONS, library ACTIONS, inject SUBCOMMANDS, board SUBCOMMANDS already existed), so a case added to a switch without a line in the const is unreachable and the list cannot fall behind. That gives 42 CLI entries against 35 tools; 30 explicit pairs cover 32 tools (add -> create_element + batch_create_elements, screenshot -> get_canvas_screenshot + export_to_image).

Allowlists, printed on every run so nothing hides: 12 CLI-only (start/stop/status, apply, install-skill, inject status|test, board current, changes, snapshot list, library list|insert) and 3 MCP-only (read_diagram_guide, get_resource, set_viewport). Four of those reasons say 'MCP lags' or 'CLI lags' outright — changes, snapshot list, library list, library insert, set_viewport — which is debt stated rather than hidden. Two further axes: a declared tool with no case arm in mcp-dispatch.ts, and a tool missing from the cheatsheet's MCP table (the only place a shell-less client learns tool names).

Verified: passes as-is; adding a 'rename' action to library gives 'CLI entry "library rename" has no MCP tool'; adding a set_theme tool gives three named failures (no CLI command, no dispatch arm, missing from the cheatsheet). bun run test exits 0, bun run type-check exits 0. Added a paragraph to ADR 0008's consequences naming the check.

Orchestrator verification: Step 0 now leads with the CLI and describes MCP as the way in for a client with no shell, keeping the one honest advantage (get_canvas_screenshot returns the image as content). The parity check passes at 35 tools against 42 CLI entries, 30 paired, and prints every allowlisted asymmetry with its reason on each run, so an exception has to keep justifying itself. I verified the passing path and the ledger; I did not re-run the two failure injections myself, because two agents are live in this tree and breaking it to prove a point would have cost more than the agent's own demonstration was worth.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:08
---
From ADR 0008. The user kept MCP for a client that cannot run a shell, and made the CLI the default everywhere else.

The skill is the load-bearing half. Its Step 0 reads 'MCP tools - if the canvas tools are in your tool list, prefer them', which is upstream's framing and now backwards. An agent's sense of which surface to use comes from there, so until it changes the decision is words in a file.

The drift check matters more than it sounds. A secondary surface nobody exercises rots quietly, and MCP would then be broken on the one day it is needed, which is the whole reason for keeping it. A parity assertion between the tool list and the command table is cheap; alternatively decide openly that MCP is best-effort and say so in the ADR. Either is honest. Silence is not.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The skill leads with the CLI and casts MCP as the shell-less path, matching ADR 0008. A parity check reads both surfaces from code rather than from a restated list, pairs tools to commands and subcommands, and fails on anything unpaired. Deliberate asymmetries carry a reason each; four are labelled MCP lags and one CLI lags, so the debt is named rather than hidden.
<!-- SECTION:FINAL_SUMMARY:END -->
