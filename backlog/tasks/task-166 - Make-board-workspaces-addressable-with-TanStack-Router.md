---
id: TASK-166
title: Make board workspaces addressable with TanStack Router
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-09 12:50'
updated_date: '2026-09-09 13:50'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
  - docs/adr/0022-the-note-decides-and-a-persons-edit-is-optimistic.md
  - src/ui/board-library/lib/library-hash.ts
  - 'https://tanstack.com/router/latest/docs/routing/code-based-routing'
  - 'https://tanstack.com/router/latest/docs/guide/search-params'
type: enhancement
ordinal: 317000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board and comparison navigation is currently ephemeral React state, so a person cannot restore a workspace from its URL or use browser Back/Forward for deliberate board navigation. The user approved code-based TanStack Router within existing UI module boundaries. Scope: open board/comparison and active pane. Selection, pending edits and voice remain session state; settings routes are not part of the initial scope. Before implementation, agree the URL vocabulary, invalid/missing-board recovery, history push versus replace behavior (including agent-driven navigation), and pending-edit handling. Decide pane-session reuse explicitly. Preserve the existing one-shot #addLibrary flow. Reconcile URL restoration wording with ADRs 0015 and 0020 without changing note authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A URL restores the requested board or comparison and active pane on direct load and reload; Back/Forward follows deliberate board navigation.
- [ ] #2 Invalid or missing targets and refused or pending board switches have agreed, visible recovery, with URL and displayed workspace consistent.
- [ ] #3 Navigation preserves pending-edit/version/hold contracts and unaffected mounted pane, workbench and voice lifecycles; library-install hash handling still works.
- [ ] #4 Code-based TanStack Router consumes existing module interfaces; approved dependencies are pinned and no competing navigation state or generated route tree is introduced.
- [ ] #5 Focused runtime/browser coverage verifies URL restoration, history and recovery; bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Researched contract, awaiting TASK-165 cleanup base before implementation.

1. Route vocabulary. One code-based route at `/` carrying the workspace in typed
   search params; no path segments, no generated route tree, no route plugin.
   `?paneA=<boardKey>&paneB=<boardKey>&pane=A|B`. A `paneX` param present means
   that pane is open; its value is the board key exactly as `PaneStatus.boardKey`
   spells it (`name` or `name@variant`, the string a human types and `[[links]]`
   use). `pane` names the active pane; it defaults to the first open pane.
   Level never enters the URL: level is board metadata, not an address
   (src/runtime/engine/lib/board-address.ts). Path routing is rejected because
   the canvas server serves index.html at `/` only
   (src/server/canvas/lib/service-routes.ts) — a path scheme would need an SPA
   fallback in server code and would 404 on every production deep link.
2. URL follows the note, and leads only on cold load and Back/Forward.
   A person's board open runs the existing command; the server answers with
   `board_switched`; the pane's status changes; the router then writes the URL.
   The URL is consumed on exactly two triggers — first mount and popstate —
   where it issues the same open command per pane that differs, plus pane
   add/close and select. No route loader and no router-owned data: routing
   needs no board listing, so it shares nothing with TASK-167 and does not wait
   on it. Router state is browser display intent only; the note stays authority
   (ADR 0015, ADR 0020: which board a pane displays is a browser operation).
3. Push versus replace (confirmed). A deliberate board open or comparison change
   (pane added or closed) pushes. Pane focus, agent- or CLI-driven board changes,
   restore reconciliation and recovery rewrites replace. Deliberateness is known
   only at the gesture, so the initiating paths mark it: shell board actions,
   the board dialogs, pane add/close, and the canvas board link (drill-down)
   through one added `CanvasSessionOptions` callback beside `onBoardLinkError`.
4. Cold load. The pane list is seeded from the parsed search so both panes mount
   once, in place, with no remount. Each pane restores after it reports a
   clientId: `openBoard({ board: <key>, pane: <clientId> })` with the pane always
   named explicitly. The server parses `name@variant` itself
   (identityFromParams -> parseBoardKey), so the UI needs no key parser and no
   listing lookup.
5. Recovery (confirmed). Pending edits or a refused write (a board that stopped
   saving) block navigation: the workspace and the URL are retained, the existing
   hold/elsewhere recovery is shown, and the person retries after recovering.
   The guard lives in the one shared navigation command so the board picker and
   the URL behave identically. A missing or invalid board raises the existing
   actionable failure notice naming the board asked for and never silently
   substitutes another; on cold load, where there is no previous workspace to
   retain, the URL is then replaced with the workspace actually on screen so URL
   and display agree, with the failure named in the notice.
6. Library hash. `clearLibraryHash` rewrites to `window.location.pathname` and
   drops the query string; it must preserve `window.location.search` so the
   one-shot `#addLibrary` install cannot wipe the workspace.
7. Dependency. `@tanstack/react-router` pinned exactly (1.170.33 current), no
   router plugin, devtools or codegen. `useBlocker` with `enableBeforeUnload:
   false` is the candidate for Back/Forward blocking; no `beforeunload` dialog
   may be introduced over the existing pagehide beacon flush.
8. Placement. A new `src/ui/<workspace-route>` module owns the search-param
   schema, the workspace projection (pane list + board keys + active pane), the
   diff, and the publish/consume hooks. Application composes it; shell, canvas
   and workbench are untouched apart from the one drill-down callback.
9. Coverage. Module-owned unit tests for the pure projection and diff; one
   browser owner for deep-link restore, reload, Back/Forward, blocked
   navigation, missing board, and mounted-pane identity across a URL change,
   registered in BROWSER_TEST_PATHS and the package browser lane. No
   file-content or configuration tests. `bun run check` is the gate.

10. Ownership constraints (parent, 2026-09-09): the navigation module owns no server resource and shares no cache owner with TASK-167's Query resources; application-root edits stay minimal (seed the pane list from the parsed search, compose the publish/consume hooks, mark deliberate opens) with the rest inside the navigation module. Implementation may start in the isolated worktree ahead of TASK-165 once the parent accepts the contract; TASK-165's rename map is applied at rebase.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on claude/task-166-workspace-router, rebased onto main 10a4d3bc.

New module `src/ui/board-routing` owns the address: `address.ts` (the workspace
model and the plan from displayed to wanted), `search.ts` (the search-parameter
encoding), `intent.ts` (which change a person asked for), `restore.ts` (the
stepwise restore and its preflight), `contracts.ts` (the port the application
implements), `BoardRoutingHost.tsx` (the one code-based route at `/`), and the
two hooks. `@tanstack/react-router` is pinned at 1.170.33; no router plugin, no
devtools, no generated route tree.

The workspace lives in search parameters — `?paneA=<key>&paneB=<key>&pane=A|B` —
carrying the board key exactly as `PaneStatus.boardKey` spells it. Path segments
were rejected on evidence: `src/server/canvas/lib/service-routes.ts` serves the
page at `/` alone, so a path would answer 404 on every direct load, and board
keys may contain `/`.

The address follows the note and leads only on the first load and on a history
POP or GO. Restoring issues the shell's own open command through a new
`runOpenKey`; the server parses `name@variant` itself, so the UI needs no key
parser and no listing lookup, and routing therefore has no loader and shares no
Query cache. Push versus replace is decided by the gesture — the picker, the
board dialogs, pane add/close, and the canvas drill-down through one new
`onBoardOpenRequested` option beside `onBoardLinkError`. An expectation is met
by "the pane I asked to move has moved", is cleared on any settle, and is
cleared explicitly when a command does not finish, so no stale push-intent
marker can survive a failed gesture.

`src/ui/application/navigation-guard.ts` is the one rule for every way a board
leaves a pane. A hold or an edit the server has not taken refuses the move; the
workspace and the address both stay, and the hold's own conflict dialog is
offered. Closing a held pane keeps its existing confirmation. A restore
preflights every pane it would move or close before each step, and a board it
cannot reach is named while the address is replaced with the workspace actually
on screen.

Two supporting changes. The guard needed `CanvasSession.pendingEdits()` over the
pane core's existing `pending()`; `pane-core.ts` was at the 600-line limit, so
its two interfaces moved to `canvas/lib/pane-core-contracts.ts` unchanged.
`clearLibraryHash` now preserves both `window.location.search` and
`window.history.state`: `@tanstack/history` patches `pushState`/`replaceState`
and keeps `__TSR_index`/`__TSR_key` in that state, so the old rewrite would have
dropped the workspace and the router's place in the history.

Coverage: 24 module tests in `src/ui/board-routing/tests` (address and plan,
search round trip, intent staleness, restore stepping, readiness waiting,
preflight refusal, unreachable naming, termination), six in
`src/ui/application/tests/navigation-guard.test.ts`, and
`tests/system/browser/workspace-address.test.ts` registered in
BROWSER_TEST_PATHS and the package browser lane. `docs/agents/frontend.md`
records the delivered contract.

Focused checks green: both TypeScript projects, `bun run lint`, `oxfmt --check`,
`bun test src/ui` (942), the repository-policy lane, and the frontend build.
The browser lane and the integrated `bun run check` are the parent's slot.

One blocker on main, not from this branch: `src/ui/shell/types/contracts.ts:104`
still uses `React.ReactNode` and fails the new `archboard(named-react-imports)`
rule from main's own 6d7700a9. Reported to the parent.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-09 13:10
---
Navigation decisions confirmed by the user (2026-09-09):
- Deliberate board opens and comparison changes push history; pane focus and agent-driven board changes replace it.
- Pending edits or refused writes block navigation: the current workspace and URL are retained, the existing recovery is shown, and the person retries after recovering.
- A missing board shows an actionable error and never silently substitutes another board.
Implementation waits for the TASK-165 cleanup base.
---
<!-- COMMENTS:END -->
