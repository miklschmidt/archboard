---
id: TASK-162
title: Restore hosted CLI and board-rendering CI
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-08 00:40'
updated_date: '2026-09-08 02:52'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/34173668405'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34175436997'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34176058299'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34177519450'
priority: high
type: bug
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The banner push exposed an aggregate CLI compatibility timeout, Chromium sandbox startup failure on Ubuntu AppArmor, and Mermaid rendering running before required write-intent validation. Hosted CI must exercise the existing contracts reliably, and invalid writes must report the same actionable refusal even when rendering is unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The failing hosted module cases complete successfully without weakening lint, type, test assertions or CI coverage.
- [x] #2 A repeatable focused reproduction demonstrates the cause and passes after the fix.
- [ ] #3 GitHub Actions succeeds for the pushed fix commit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Give independent CLI compatibility modes separate cases with their original assertions and deadlines. Use the installed sandboxed Chrome binary on the hosted runner. Validate write intent before Mermaid preparation while preserving renderer cancellation and board-lock phase reporting. Apply a measured ten-second cold renderer startup deadline and the existing twenty-second test ceiling to composite rendering workflows. Run the full local gate, commit and push each focused fix, and monitor GitHub Actions until the latest revision passes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The aggregate CLI owner launched 22 processes under one five-second deadline. A one-CPU Bun 1.4.0 Linux container reproduced failure at 5003 ms; diagnostic observation showed all processes finishing in 6418 ms. Eleven separately named modes preserve the original assertions and timeout. Three repetitions of the CLI and code-target owners passed under a half-CPU quota (132 passes).

Hosted run 34175436997 passed all 2660 module tests, then exposed Chromium's No usable sandbox failure. CI now exposes /opt/google/chrome/chrome as chromium through PATH, which isolated servers already inherit. Run 34176058299 verified this setup: all module and rendering/vault-only owners passed, leaving one undescribed Mermaid-write refusal.

The refusal reproduced locally in 921 ms with the existing doing-boundary owner configured to use an unavailable renderer. Preparation now follows request validation and still precedes the board lease; renderer and board-lock wait phases retain their existing health-report identities. The strengthened refusal and accepted rendering, lock, cancellation, and vault workflows passed (11 tests, 218 assertions).

Final local validation passed lint, formatting, both type checks, module, system, and repository lanes. The full check initially stopped at one fullscreen pane-rectangle assertion; that unchanged owner passed through the focused adapter, then the complete serial browser lane passed. No browser code or assertions changed. Diagnostic instrumentation, container, and worktree were removed; logs remain outside the repository. Hosted verification of the final product fix is pending.

Run 34177519450 passed the strengthened write refusal. The renderer and vault workflow first cases were killed at 5000/5002 ms; later failures are consequences of their shared canvas being killed. The earlier hosted vault workflow passed at 5001.30 ms, directly at the current deadline. Renderer diagnostics after cancellation report active render work while the test cleanup forces the server to exit.

A half-CPU systemd scope reproduces the renderer failure. Allowing the test to observe past five seconds exposes the product startup error: the renderer page did not become ready before its five-second startup deadline. In a disposable checkout, a ten-second startup deadline and the normal twenty-second test budget pass three cold PNG/SVG workflows at 13.09, 11.49, and 11.99 seconds. These measured limits preserve all output assertions and the existing normal wall-clock ceiling.

The vault workflow passed with all 61 assertions in 6065 ms under a one-CPU quota, exceeding the native five-second deadline. At a half-CPU quota it exceeded the unchanged twenty-second wall-clock ceiling; no exception was added. The production startup bound is now ten seconds, and the rendering owner plus the single composite vault case use the existing normal twenty-second test budget. The vault test body is unchanged apart from formatter indentation. Full local verification is running.

The complete bun run check passed after the timing fix: lint, formatting, both type checks, 2660 module tests, 306 system tests, repository checks, and every normal serial browser owner. The two previously timed-out workflows took 1004 ms and 2623 ms on the unrestricted local host. The temporary measurement worktree and all owned CPU-limited scopes have been removed; diagnostic logs remain outside the repository.

Hosted run 34179112441 passes all 2660 module tests and the cold PNG/SVG renderer case at 1602 ms, but reveals a recurring synchronous child-process hang across 33 system cases. The first two activation cases pass; subsequent Git init fixture calls block until five-second case termination with empty stderr, and later CLI installs and artifact Git commands show the same pattern. The vault workflow now hangs inside a CLI call at twenty seconds. This is distinct from measured cold-render startup; investigate the first blocked child before changing any further bounds.

The activation subset passed 400 repetitions on a one-CPU local scope, 400 in the Bun 1.4.0 Linux container, and 400 more in that container with --smol. The full local system lane with --smol also passed all 306 cases in 156 seconds. A separate codex/ci-process-diagnostics branch will run unchanged checks through a temporary Node observer that records owned child state and wait channels without argv or environment. This captures whether the hosted stuck child is running or already exited; diagnostic code will not be merged.

Diagnostic run 34180382718 does not reproduce the broad synchronous-child hang: code-target owners pass, cold PNG/SVG completes in 7131 ms, and the vault workflow passes in 5042 ms. It fails only the artifact-generation aggregate at 5014 ms while its second real generator is active; the following generator owners each take about 2.5 seconds. The brief zombie snapshots also occur around passing cases, so they do not establish a lost-exit defect. Reproduce the concrete aggregate deadline before selecting a fix.

The artifact aggregate passes in 4416 ms with one CPU, fails at 5174 ms with half a CPU, and completes all 43 assertions in 13286 ms under the same half-CPU quota when observed with the normal twenty-second ceiling. Apply that existing budget to this one composed case; keep every assertion and the other cases unchanged.

The implemented artifact budget passes the unchanged four-case owner locally (56 assertions) and two half-CPU repetitions of the aggregate at 15.28 and 14.71 seconds (86 assertions), within the existing twenty-second ceiling. Diagnostic branch run 34181046413 includes this test fix and retains the temporary observer so any recurring broader process stall can still be captured. A full normal local gate is running before the main-branch commit.

The complete normal bun run check passes with the artifact budget change, including all browser owners. Diagnostic run 34181046413 passes the artifact case in 3692 ms and the vault workflow in 4148 ms, but its first renderer fails to open the Chrome control port within startup, causing the two concurrent first renders to exceed their twenty-second case ceiling. This is a control-port startup failure, not the earlier measured renderer-page delay. Extend the temporary observer to inspect Chrome state and independently probe its loopback control port.
<!-- SECTION:NOTES:END -->
