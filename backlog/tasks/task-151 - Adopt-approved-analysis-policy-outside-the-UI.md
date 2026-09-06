---
id: TASK-151
title: Adopt approved analysis policy outside the UI
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-05 12:28'
updated_date: '2026-09-06 21:44'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/strict-analysis.md
ordinal: 303000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-150 expanded into repository-wide strict-rule remediation before the UI rebuild. The user has now limited new enforcement to src/ui and requested that remaining source adoption be deferred. Preserve all corrections already made. Continue the remaining runtime, server, CLI, script, test and generated-source analysis work only in this later task, against the user-approved policy rather than the previously enabled full catalogue. TASK-150 UI delivery must not wait on this work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scope and applicable rules outside src/ui are explicitly reviewed against the then-current user-approved UI policy before source repair resumes.
- [ ] #2 Previously corrected behavior and contracts are preserved, and remaining findings are resolved without broad suppressions or concurrency changes made solely to satisfy lint.
- [ ] #3 Ordinary sequential lint/compiler checks and the cheapest relevant behavior checks verify the adopted scope with explicit test isolation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
User-approved scope (2026-09-06): the full UI policy (JSDoc on every function, classic complexity 6, 600 physical lines, @/ local imports, no default exports, correctness/suspicious/perf, the eight nursery rules, all UI plugins) applies to src/runtime, src/server, src/shared, src/cli, src/bin.ts, src/server.ts, scripts and tools. Tests (tests/** and src/*/*/tests/**) stay on the current repository baseline. Generated Codex declarations stay lint-excluded and compiler-checked. vite.config.js and tools/oxlint-plugin-archboard.js are converted to TypeScript under the policy.

1. Foundation (coordinator, this worktree): promote the UI policy to the root .oxlintrc.jsonc (plugin and shadcn override paths adjusted, ignore patterns for tests, generated output, frontend and the frontend-project file src/server/board-rendering/browser.ts, a vite.config.ts override permitting its required default export); move the pre-task baseline to .oxlintrc.baseline.jsonc covering tests/**, src/*/*/tests/**, frontend/** and browser.ts; replace lint:repository/lint:ui with lint:baseline and lint:policy, both through scripts/lint.ts, sequential, one worker, memory-safe; adapt fix; convert vite.config.js to vite.config.ts; point boundaries.test.ts at the baseline config; update docs/agents/strict-analysis.md, strict-analysis-policy.json and boundaries.md. Commit.
2. Fan-out (parallel subagents, each in its own worktree branched from the foundation commit, one analyzer at a time per copy, memory-capped scope, test isolation env): A src/runtime/engine; B src/server; C src/runtime codex-dynamic-tools, board-inspection, codex-transport, codex-process, codex-thread-link, codex-epoch; D remaining src/runtime modules; E src/cli, src/shared, src/bin.ts, src/server.ts; F scripts, tools plugin conversion to TypeScript, tools added to the policy lane. Each agent resolves every policy finding in its area by repair, splitting oversized files into named modules, reducing complexity by extraction, documenting purpose in JSDoc, and switching to @/ imports; behavior and contracts preserved; no broad suppressions, no concurrency changes made to satisfy no-await-in-loop; a line-level disable with a stated reason only where sequential awaiting is the contract. Each agent verifies with lint:policy on its area, type-check, and the module tests it touched.
3. Integration (coordinator): merge the six branches, run bun run check with test isolation, resolve cross-area residue, then one independent review of the fixed BASE..TARGET range, then finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope measurement (2026-09-06, worktree .claude/worktrees/task-151, branch claude/task-151-analysis-policy from bb651bd9). Non-UI inventory: src/runtime 487 files/120k lines, src/server 111/33k, src/shared 864/18k (820 generated declaration files, 9.3k lines), src/cli 49/11k, scripts 7/2.9k, tools 1 JS/979, tests 205/48k; 320 test files outside src/ui; 37 authored non-UI files exceed 600 lines (largest src/server/canvas/lib/application.ts at 5190). Probe: src/ui/.oxlintrc.jsonc run type-aware, one worker, in a 16 GiB memory-capped systemd scope over src/runtime src/server src/shared src/cli src/bin.ts src/server.ts scripts tests (browser.ts excluded, it is a frontend-project root). Result: 14113 diagnostics in 889 files. By rule: require-jsdoc 6451, archboard/absolute-imports 3537, no-unsafe-type-assertion 1209, complexity>6 1042, no-await-in-loop 405, no-unnecessary-condition 354, require-param 351, require-returns 350, no-unnecessary-type-assertion 118, await-thenable 70, consistent-return 40, max-lines 36, remainder under 100 total. By area: tests 6376, src/runtime 5175, src/server 1596, src/cli 504, scripts 220, src/shared 237. The frontend files and vite.config.js/tools plugin JS were not probed: they are not roots of the repository tsconfig.json and the guard refuses them.
<!-- SECTION:NOTES:END -->
