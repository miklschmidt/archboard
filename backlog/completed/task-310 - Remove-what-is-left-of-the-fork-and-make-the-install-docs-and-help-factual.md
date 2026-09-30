---
id: TASK-310
title: 'Remove what is left of the fork, and make the install docs and help factual'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 14:01'
updated_date: '2026-09-23 14:24'
labels:
  - docs
  - cli
  - cleanup
dependencies: []
ordinal: 542000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user (2026-09-23): nothing is left of the forked Excalidraw MCP project and archboard does not use Obsidian, yet the environment still says EXPRESS_SERVER_URL and ENABLE_CANVAS_SYNC, a one-time migration from the excalidraw-canvas state directory remains, AGENTS.md and the archboard-dev skill describe taking fixes from upstream, CONTEXT.md keeps Excalidraw-era terms and DESIGN.md names commands that do not exist. INSTALL.md is stale and is to be rewritten from checked facts. Two help texts are wrong: semantic record marks --doing required (only --discard needs it) and semantic edit's help leaves out walkthroughs. The user also doubts the skill sync script: it copies skills/ into untracked directories that go stale between syncs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 semantic record's help asks for --doing only with --discard, and semantic edit's help says an edit can carry walkthroughs
- [x] #2 ARCHBOARD_URL replaces EXPRESS_SERVER_URL, which is refused with a message naming the new name; ENABLE_CANVAS_SYNC and the excalidraw-canvas state migration are gone
- [x] #3 AGENTS.md, the archboard-dev skill, DESIGN.md and CONTEXT.md carry no upstream-fork guidance, dead Excalidraw-era terms or commands that do not exist
- [x] #4 INSTALL.md is rewritten from checked facts in plain English, with no Obsidian
- [x] #5 The skill sync script is gone: this checkout's agents reach skills/ through tracked symlinks, and the generated skill references are made by bun install
- [x] #6 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Help: requiresShared on a local option derives 'required with X' for a shared option; record's --discard needs --doing; edit's help names walkthroughs.
2. Env: ARCHBOARD_URL replaces EXPRESS_SERVER_URL (old name refused, exit 2); ENABLE_CANVAS_SYNC and the excalidraw-canvas state migration go.
3. Skills: tracked symlinks from .claude/skills and .agents/skills into skills/, generate:skill-artifacts in postinstall, sync script gone.
4. Docs: INSTALL.md rewritten from an audit, in plain English; CONTEXT.md dead terms removed and stale ones rewritten; DESIGN.md commands and binding section; AGENTS.md refusal list; ADR 0002 superseded; archboard-dev description and upstream section.
5. Code: unused schemas, BOARD_CONFLICT, WRITE_ANSWER, held(), status summary, exit-code help, retired commands, stale comments.
6. bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commits: 3d8bc68c help, 5e84bd90 env, 9414ebdc skills linked + fork text, 8ff84c5c INSTALL.md + setup block (it claimed status prints the vault), 1be4288d CONTEXT/DESIGN/AGENTS/ADR 0002, a2e97891 dead command-layer code.
Facts found on the way: Codex follows directory symlinks for repository skills (codex-rs ext/skills/src/loader/host.rs:161); ~/.agents/skills/archboard on this machine is an install-skill copy from 2026-09-19, not a link, so other repos use an older skill until install-skill runs again; the user's Docs-Architecture-Design .envrc sets EXPRESS_SERVER_URL and will be refused until renamed; the local upstream git remote is left for the user.
Not done, noted for the user: pane-contact and socket timing comments still describe editing panes (pre-ADR 0023); the scratch board is still wired in board-address.ts; ADRs 0001, 0003, 0004, 0007, 0013 and 0017 describe removed features without a superseded status; install-skill --yes without --vault silently repoints a shared-vault repo (documented in INSTALL.md).
Verified: bun run check exit 0 (modules 3373, system 177, repository, browser lanes); the old-name refusal and help by hand; install-targets and skill-distribution/evaluation tests; plain-English lint clean on README.md and INSTALL.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed what was left of the fork: ARCHBOARD_URL replaces EXPRESS_SERVER_URL (the old name is refused by name), ENABLE_CANVAS_SYNC and the excalidraw-canvas state migration are gone, and the command layer lost its element-era schemas, never-sent conflict refusal and stale help. The skill sync script is replaced by tracked symlinks and a postinstall step. INSTALL.md is rewritten from an audit in plain English, CONTEXT.md, DESIGN.md, AGENTS.md and ADR 0002 describe archboard as it is, and two help texts are corrected. bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
