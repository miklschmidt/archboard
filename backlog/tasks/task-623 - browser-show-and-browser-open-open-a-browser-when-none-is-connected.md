---
id: TASK-623
title: browser show and browser open open a browser when none is connected
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-10T13:43:00Z'
updated_date: '2026-11-10T13:49:00Z'
labels: []
dependencies: []
ordinal: 1066000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent that runs `archboard browser show` with no browser tab connected gets `BROWSER_REQUIRED` and must ask the user to open the canvas by hand, then retry. The CLI can open the canvas itself in the default browser, on the repository of the vault, and continue once the pane connects. `browser close` keeps the refusal, because it acts on a pane that must already exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `browser show` with no connected browser opens the canvas address of the caller's repository (`?repoA=<identity>`) in the default browser, waits for a pane, then shows the reading
- [x] #2 `browser open` with no connected browser opens the canvas and reports the one pane instead of splitting
- [ ] #3 With no display on Linux, a launch failure, or no pane after the wait, the command refuses with `BROWSER_REQUIRED` and names the address
- [x] #4 `browser close` still refuses with `BROWSER_REQUIRED` when no browser is connected
- [x] #5 Command descriptions, the first-map guide and the archboard skill state the new behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `open` (v11) as a dependency and regenerate bun.nix.
2. Add `openCanvas` beside `requirePrerequisite` in apps/cli/src/cli/contract/clients/prerequisites.ts. Its waits live in PANE_MS.
3. Call it from the show and open handlers in apps/cli/src/cli/commands/pane/operations/pane.ts.
4. Update descriptions, site/src/content/docs/first-map.mdx and skills/archboard/references/canonical-models.md.
5. Verify by hand against a running server with no tab, and with no DISPLAY.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Manual runs against servers with no tab: `browser show` on port 3017 opened the tab, the pane arrived in about 4 s and the show landed. `browser open` on 3018 reported one pane, and a second run split it. `browser close` on 3019 refused with exit 4. With DISPLAY and WAYLAND_DISPLAY unset, `browser show` refused with exit 4 and named `http://127.0.0.1:3000/?repoA=github.com/miklschmidt/archboard`.
The socket count was the wrong signal: a socket connects before its pane registers. The wait reads `GET /api/panes` instead.
The opened tab lands on the chosen checkout of the repository, which can be another worktree. Without `--pane`, the server takes only a pane of the caller's vault, so `show` addresses the new pane by its id. The agent show then chooses the caller's checkout, as it already does with `--pane`.
Not verified by hand: a launch error from `open`, and the 20 s timeout. A stub `BROWSER=true` did not stop xdg-open from opening the real browser.
Existing behavior left as is: with a tab on another checkout of the same repository and no `--pane`, `show` still refuses with `BROWSER_REQUIRED`, and the server message says that nothing is on screen.
No architecture proposal: no module or relationship changes. The CLI already reaches the browser through the server, and the change only launches the default browser.
Checks: types, oxlint on apps/cli and packages/timing, bun-nix, `bun test --isolate` of apps/cli/tests and the command-contract-artifacts system test (114 pass), and the site build.
<!-- SECTION:NOTES:END -->
