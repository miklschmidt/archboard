---
id: TASK-368.05
title: Flat dogfood module boards draw their modules as containers
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:41'
labels:
  - interfaces
  - architecture
dependencies:
  - TASK-368.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: docs
ordinal: 641000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-09-29, 9 of the 15 dogfood boards drew no container. Not every board has a module seam to draw, but the module boards that describe one `src/<area>/<module>` do.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each board without a container either draws its modules as containers through an adopted proposal, or its task notes say why it has no module seam
- [ ] #2 Relationships that crossed into another module's private file now land on that module's entry points, or the notes say why the code really does that
- [ ] #3 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected boards: the 8 current variants that draw no container (measured 2026-10-06 with semantic show): Archboard, Archboard server, Codex workhorse, Command dispatch, Command interface, Renderer layout, Semantic renderer, Skill evaluation. Board persistence drew its container on TASK-368.04.

Boards with a module seam, one proposal each, named TASK-368.05:
1. Command dispatch@TASK-368.05: container Command routing bound to src/cli/command-routing; the 7 parts under its lib/ inside. Command catalogue (commands/run.ts) calls runCliWith and registryOf through index.ts, so those two become entry points; no relationship moves.
2. Skill evaluation@TASK-368.05: container Evaluation harness bound to src/runtime/skill-evaluation; the parts under its lib/ inside. Eval CLI (scripts/evaluate-skill.ts) calls loadSuite, runBatch, gradeBatch and writeReport through index.ts, implemented in suite.ts, batch.ts, grading-run.ts and records.ts, so the existing edges land on entry points; no relationship moves. Give the board its scope summary (it has none).
3. Semantic renderer@TASK-368.05: container Renderer core bound to src/transformers/semantic-renderer with its 12 parts inside; Bun host (src/runtime/semantic-renderer), Browser application, Archboard server and Host canvas stay outside. Bun host and the browser renderer call renderBoard (board.ts) and installRendererHost (root host.ts re-exports lib/host.ts), so Board answer and Renderer host become entry points; no relationship moves.
4. Renderer layout@TASK-368.05: the same Renderer core container around its 11 bound parts; Pretext, Host canvas, Graphviz and libavoid stay outside. The board draws no caller of the core, so every child is a hidden part (ADR 0044 allows this and says so).
5. Codex workhorse@TASK-368.05: the board draws each module whole as a card bound to its root file; the one crossing is Workhorse start -> Tell coordinator (lib/tell-coordinator.ts). workhorse-start/lib/model.ts imports the two constants through the codex-coordinator-callbacks root, so draw container Coordinator callbacks bound to src/runtime/codex-coordinator-callbacks with Tell coordinator inside as its entry point.
6. Archboard server@TASK-368.05 (last: TASK-369.02 will branch here): container Archboard server bound to src/server/archboard with the 17 parts bound under its lib/ inside. HTTP callers land on the routes they request; Board lease -> Board announcements is the onBoardLockChanged subscription. No relationship moves.
7. Command interface@TASK-368.05 (last, same reason): containers Command contract (src/cli/command-contract: Bootstrap, Status, Contract execution, and a new entry point runCommand bound to runner.ts) and Commands (src/cli/commands: the command files and the catalogue). Move Command routing -> Contract execution onto runCommand (session.ts:75 calls runCommand; runner.ts calls executeCommand) and add runCommand -> Contract execution.

Board without a module seam: Archboard (system level; its parts are processes and stores, not src modules). Notes say why, and why its two datastores bind to private owner files.

For each proposal: claim, branch from current with --expect-version, restate moved nodes whole with parent, semantic inspect --container, semantic compare, rasterize and look, set the scope summary, adopt, release, commit the board file and this task by path. Finally ./bin/dogfood check reports no diagnostics.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Command dispatch@TASK-368.05 (branched from Current architecture at v7, adopted at v11).
- Container: Command routing (module), bound to src/cli/command-routing. Its 7 parts bound under lib/ are its children; every id kept.
- semantic inspect --container 'Command routing': 2 entry points (runCliWith, Registry and surface), 5 hidden parts (Global flag readers, dispatchedCommand, Interruptible run, Failure reporting, Help text), 1 caller (Command catalogue), 3 outgoing (to runCommand and Server client twice), 0 pass-through.
- Evidence: src/cli/commands/run.ts imports runCliWith and registryOf through command-routing/index.ts and calls them at run.ts:151 (runCli) and :133 (cliContractRegistry). index.ts re-exports them from lib/session.ts and lib/registry.ts, the files the two parts bind. No relationship moved.
- Differences from index.ts: run.ts also calls cliSurfaceOf (:125) and helpText (:142), from cliSurface and commandHelp, which nothing in src, scripts, tools or tests calls. So the board draws no relationship for them. TASK-368.10 owns reporting exposed names that nothing reaches. contract and child (lib/route.ts) build the command table and are not drawn.
- Compare: one interface change (Command routing gains runCliWith and Registry and surface, caller Command catalogue), the container added, 7 parents changed, no relationship changed.
- Picture: 1549x953 against 1604x853. The catalogue enters the container from the top right; runCommand and Server client sit outside it. Labels legible.

Skill evaluation@TASK-368.05 (branched from Initial at v9, adopted at v12).
- Container: Evaluation harness (module), bound to src/runtime/skill-evaluation. The 21 parts bound under its lib/ are its children; every id kept. Eval CLI (scripts/evaluate-skill.ts), Evaluation inputs (evals), Agent CLI, Archboard server, Codex CLI and Claude CLI stay outside.
- semantic inspect --container 'Evaluation harness': 4 entry points (Suite loader, Batch orchestrator, Grading session, Report), 17 hidden parts, 1 caller (Eval CLI), 6 outgoing (to Evaluation inputs, Codex CLI twice, Claude CLI, Archboard server, Agent CLI), 0 pass-through.
- Evidence: scripts/evaluate-skill.ts imports through skill-evaluation/index.ts and calls loadSuite (:135, lib/suite.ts), runBatch (:238, lib/batch.ts), gradeBatch (:269, lib/grading-run.ts) and writeReport (:285 and :311, lib/records.ts). These are the files the four entry points bind, so no relationship moved.
- Differences from index.ts: the script also calls resumeSelection (:186), which lives in batch.ts, the Batch orchestrator entry point, as part of run. It also calls pinVersions (:293, lib/pin-versions.ts) for the pin subcommand and executableVersion (lib/version.ts). No part draws those two, because the board's question is how a batch is run, graded and reported. Repinning is outside that scope. The script is the only file outside the module that imports it. index.ts exports many more names, which only the module's own tests use. TASK-368.10 owns reporting them.
- The board had no summary. It now carries 'Service level: the harness that measures the consumer skill, the four entry points the eval CLI reaches, and the runs, grading and report behind them. Follow linked subjects for related levels.'
- Compare: one interface change (Evaluation harness gains the 4 entry points and the caller Eval CLI), the container added, 21 parents changed, all 37 relationships unchanged.
- Picture: 3860x1729 against 3438x1813. The container holds everything but the CLI and the externals, and the Grading region sits inside it. Eval CLI enters at the top left, and the outgoing lines leave right and down to the CLIs and the server.
<!-- SECTION:NOTES:END -->
