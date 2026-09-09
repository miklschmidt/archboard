---
id: TASK-167
title: Replace manual frontend server-resource caching with TanStack Query
status: In Progress
assignee: []
created_date: '2026-09-09 12:50'
updated_date: '2026-09-09 14:42'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - src/ui/application/lib/use-boards.ts
  - src/ui/canvas/api.ts
  - docs/adr/0022-the-note-decides-and-a-persons-edit-is-optimistic.md
  - >-
    https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
  - 'https://tanstack.com/router/latest/docs/guide/external-data-loading'
type: enhancement
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The board-listing hook hand-manages request generations, errors, preview caching and refreshes. TanStack Query is approved to replace request/response state, beginning with listings and unmounted server previews; additional resources such as library or opener settings qualify only where migration removes manual state without changing workflow ownership. Mounted scenes, edit acknowledgements, workbench streams and voice keep their existing owners. fetchBoards currently combines persisted board inventory with live pane inventory: settle ownership and invalidation before migration. Library broadcasts and install acknowledgements need their own explicit contract if that resource is included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board listings and server previews have one TanStack Query cache owner per resource; replaced manual loading/cache state is removed and query options/API adapters remain domain-owned.
- [ ] #2 Mounted previews continue to come from pane scenes, and stale or late server snapshots cannot overwrite them; socket/edit/workbench/voice ordering and lifecycle ownership is preserved.
- [ ] #3 The persisted-board/live-pane listing boundary and event invalidation, reconnect, cancellation, freshness and retry policies are explicit; loading, empty, stale-data, failure and recovery states remain usable.
- [ ] #4 Additional migrated request/response resources are named with the manual state removed; unmigrated workflow controllers remain authoritative. Route loading, when present, uses the same Query cache.
- [ ] #5 Approved dependencies are pinned; no automatic board-write retries or second optimistic model is introduced. Relevant runtime tests and bun run check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Researched plan (contract proposed to the parent pane; items 1a-1c await its decision).

Ownership
1. New UI module src/ui/board-catalog owns the server-resource cache: createBoardQueryClient(), a QueryClientProvider wrapper, the queryOptions factories boardListingQuery()/boardPreviewQuery(key)/boardInfoQuery(key), and the hooks that subscribe to them. API adapters stay in src/ui/canvas/api.ts and are imported through that root entrypoint. Keeps the cache owner separate from the router (TASK-166) and off the application root.
2. Pin @tanstack/react-query at 5.102.8 exactly (peer react ^18||^19; repo is on 19.2.8).

The listing boundary
3. The persisted vault inventory is the query resource: key ["boards","listing"], GET /api/boards with the query signal. The live pane inventory (open, onScreen) is derived from the local pane list and pane records instead of a second GET /api/panes, so each fact has one owner and pane letters stop being derived twice. fetchBoards loses its /api/panes half. (Decision 1a: parent may instead keep a separate ["panes"] query invalidated by onPaneStateAccepted.)
4. The vault === "" sentinel that the navigator uses as its loading flag and BoardDialogsHost tests is replaced by the query pending state.

Previews
5. Mounted previews stay pane-owned in a small application hook keeping PANE_DEBOUNCE_MS and fingerprintMountedPreview. Server snapshots become one query per board, ["board-preview", key], enabled only for listed boards no pane holds, with the signal threaded through.
6. One read rule in ui/board-preview: previewFor(key) = mounted[key] ?? server cache[key] ?? null, mounted honoured only while a pane holds that key. Two stores, so a late or stale server snapshot cannot overwrite a mounted scene, and a held board still falls back to its cached snapshot rather than blanking.
7. Subscribe once with useQueries in the owner that assembles the shell view so ShellView.previews stays a plain record and ui/shell stays presentational.

Freshness, invalidation, retries, cancellation
8. Listing: 30s staleTime, refetch on window focus and mount, no polling; invalidated by every board command that can write the vault, by a hold resolving, and by an agent_activity snapshot naming an unlisted board key.
9. Previews: 60s staleTime, no focus refetch, explicit gcTime; invalidated by the Refresh control, by a command that wrote that board, and by the end of an agent activity entry for that key.
10. Reconnect: navigator.onLine does not move when the local server restarts, so the product signal is the pane socket returning. Proposed one narrow pane event onPaneReconnected(paneId) raised where connection health already flips to true. (Decision 1b: parent may instead accept window focus plus the manual Refresh, recorded as such.)
11. retry false for every read in this cache: a localhost failure is a real failure and the navigator already offers Refresh. No board write goes through Query; writes keep their command owners, version checks and semantics, so no write retries and no second optimistic model.
12. Add a signal pass-through to json() in ui/canvas/lib/http.ts so Query can cancel; this removes the generation counter in use-boards and the live flag in use-board-placeholders. Every new duration goes in src/shared/timing/timing.ts with what it pulls against.

Third resource and exclusions
13. Migrate GET /api/boards/info as ["board-info", key], replacing useBoardPlaceholders and its effect that copies the answer into pane records.
14. Not migrated, deliberately: the library (a bidirectional workflow controller; migrating it would create the second optimistic model AC #5 forbids), opener settings (union replies that never throw, dialog scoped, per-action busy), elements/files (the mounted canvas), and all workbench, voice, claim and socket ordering.

Router coordination
15. TASK-166 receives the query client through router context and calls ensureQueryData with the same queryOptions objects; no route-owned adapter and no second cache.

Validation
16. tests/system/browser/board-navigator.test.ts stays the owner of the visible listing and preview states. A module owner under src/ui/board-catalog/tests covers invalidation and mounted-over-server precedence against a stubbed api with a retry-false client. shell-view.test.ts keeps testing the pure assembly. No file-content tests. bun run check is the gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on claude/task-167-query-cache, before the TASK-165 cleanup rebase.

New module src/ui/board-catalog owns the browser's cache of the server's board answers: the query keys and per-resource options (lib/queries.ts), the one QueryClient and its product defaults (lib/provider.tsx), the composed listing and its named invalidations (lib/use-board-catalog.ts), the scratch-board reads (lib/use-scratch-boards.ts), and the leaf preview component (lib/BoardPreview.tsx). Two pure root entrypoints, listing.ts and preview-source.ts, keep the composition and the precedence rule importable without pulling React or Excalidraw in.

Ownership as accepted by the parent: /api/boards and /api/panes are separate query resources composed at read, so a failed pane read leaves the vault listed and only reports itself when nothing of it is left; cross-tab visibility of unpersisted boards is preserved. Local pane records stay the authority for which boards are held, which is what disables a preview query and decides precedence.

Previews are two stores merged by previewSourceFor: the pane's mounted scene wins while a pane holds the board, the cached server snapshot shows until its first frame, and a late snapshot cannot displace a live scene because it never enters the same slot. Each row subscribes at its own leaf through ShellView.renderPreview, a slot like the mounted canvases; ui/shell no longer imports the preview cache, the gate or the theme for it. The one assembly the existing pure ShellView contract forces is the listing itself, which stays a value on the view.

Freshness: listing 30s and refetch on focus, previews 60s and never on focus, gcTime 5 min, all three in src/shared/timing/timing.ts. Invalidated by board commands, dialog outcomes, accepted pane reports, agent activity starting or settling on a board, the navigator's Refresh, and a new onPaneReconnected event raised once per returning socket in pane-core. Reads never retry; no write goes through the cache, so no write retry and no second optimistic model. json() gained a signal pass-through, which retired the generation counter in use-boards and the live flag in use-board-placeholders.

Removed: use-boards.ts, use-board-placeholders.ts, PaneRecord.placeholder, ShellView.previews and the vault === "" loading sentinel. The scratch flag now comes from the board-info query keyed by board.

To make room under the 600-line cap, pane-core stopped forwarding onPaneStateAccepted and onStaleFrontend one at a time and hands the report sender the session listeners instead.

Focused checks green: bun run lint (policy and baseline), fmt:check, both tsc projects, and all 908 src/ui module tests. Browser and system lanes wait for the full gate slot.

Rebased onto bc89c2fa (TASK-165 cleanup). Conflicts were all path moves plus the two hooks this task deletes: use-boards.ts and use-board-placeholders.ts were renamed into hooks/ by the cleanup and removed here, resolved as deletions. Imports adopted the cleanup's paths (application/hooks, shell/components/Navigator.tsx, shell/types/contracts.ts, board-preview/PreviewCard.tsx), and the new module now follows the same concern layout: board-catalog/{components,hooks,lib,tests} with listing.ts and preview-source.ts as pure root entrypoints. No behaviour was changed by the rebase. Focused checks green again after it: lint, fmt:check, both tsc projects, 908 src/ui tests, and build:frontend.

Review follow-up (commit ea6e67cc): createBoardQueryClient moved out of the provider component into lib/query-client.ts and exposed from the module root; the new files take their React types by name (JSX, ReactNode); the preview query and the precedence rule moved behind useBoardPreviewSource so the race is reachable through an interface rather than through a card that needs a real canvas.

Runtime cache coverage added at src/ui/board-catalog/tests/board-cache.test.tsx: the catalog's own hooks mounted under its own provider, with a fake canvas server behind global fetch. It asserts that each resource is read once and again only when something invalidates it, that a vault refusal is reported without a retry and recovers on the next read, that a pane-inventory refusal leaves the vault's boards listed, that a snapshot answering after a pane took the board does not replace that pane's scene, and that a board an agent settled on is read again while its neighbours are not. Both precedence and preview invalidation were confirmed load-bearing by inverting them and watching the owner fail. Nothing asserts a configuration value or a library internal.

Focused browser slot, all green: board-navigator (2 tests), shell-layout, board-drill-down, pane-telemetry-recovery and claim-interaction, run through the strict adapter, exit 0. test:repository green. Module lanes: 913 src/ui tests. Lint (policy and baseline), fmt:check and both tsc projects green. The final combined bun run check is the parent's, after Router lands.

Review findings from /tmp/archboard-task-167-review.md, fixed in commit e78e3ba2. Each fix was confirmed load-bearing by inverting it and watching its owner fail.

1. Lost invalidation during a first read. Confirmed against the installed query-core: Query.fetch only silently cancels and restarts an in-flight read when state.data is defined, so a read with nothing cached behind it is reused, and successState clears isInvalidated and stamps the answer fresh. createReadAgain now invalidates a second time once such a read lands, and a burst against one unanswered read shares the single re-read, so N events cost one extra read rather than N. Nothing is cancelled, so no CancelledError or AbortError can reach the UI.

2. board-info recovery. reload(), which is the navigator's Refresh and now also the reconnect path, invalidates the info reads as well as the listing and previews. useScratchBoards reports how many open boards could not be asked about, and the Scratch group says so rather than silently withholding the naming affordance; the vault listing is untouched by an info failure.

3. Human write invalidation. A done outcome now names the boards the command wrote, filled in per command: a save names the note written and the board it was written from, create names the created board, clear and reload name the pane's board, and an open names none because it writes nothing. Both settle() in shell-actions and the dialogs' onDone pass that straight to catalog.boardsChanged, which invalidates the listing plus exactly those boards' preview and info. No retries and nothing is written into the cache.

4. Pane retirement. canvasPaneListingKey in @/ui/canvas/workbench-socket now includes the pane count the server answered a report with, so a survivor's next report raises onPaneStateAccepted and the inventory is read again. The evidence comes from the server's own answer, which is necessarily from after the retirement, so it does not race the socket disconnect, needs no new lifecycle event, and covers a pane closed by any route including another tab's.

Runtime regressions added: an event during a first read forces an answer from after it (listing and preview together); a burst during one first read converges on exactly one more read; a name state that could not be read is withheld, said, and recovered by the refresh; and the listing key follows the board and the server's pane count but not the camera. All at module owners.

Not covered here: navigator occupancy end to end after a direct and a history close. That needs a browser owner and the Router agent holds the slot; the module owners cover the signal and the re-read, and I can run board-navigator or shell-layout for the visible half when the slot frees.

Green after the fixes: lint (policy and baseline), fmt:check, both tsc projects, 917 src/ui module tests.

Second review round, commits c6a6eb2f, 403f5967 and 60cf5fe4.

Invalidation during a read that is still on the wire: the earlier double-invalidate was wrong twice over, and both were reproduced. A query nobody can read yet (a preview of a board a pane has taken) is skipped by refetchQueries entirely, so both awaits resolved before the stale answer landed; and the deferred bookkeeping was keyed by prefix, so an event dropped any query whose first read began after it. Both are fixed by one smaller mechanism: cancel the queries before invalidating them. A cancelled read reverts rather than fails, so data already on screen stays, no cancellation reaches a person, and the invalidation stands until whatever disabled the query lets it read again. The bookkeeping is deleted.

Pane retirement: the pane-count key was withdrawn along with its export and unit test, on the reviewer's evidence that an unchanged report is never sent, another tab's close changes no local fact, and a resize can be answered before the closing socket is gone. The pane that goes now says so from its own socket close, which the server has necessarily processed first.

Pane inventory freshness: refetchOnWindowFocus was stale-only against a 30s window, so closing a pane in another tab and coming straight back kept showing it. The inventory now reads again on every return; the vault keeps the stale-only default.

Ordinary drawing: covered by the board being released. While a pane holds a board the navigator draws that pane's scene, so leaving is the one signal that covers drawing, typing, undo and paste alike, none of which any command outcome describes.

Half-finished commands: create writes a note and then points a pane at it. A failure in the second step used to discard the first. Commands now say what they wrote as they write, and both the shell actions and the dialog read those boards again whichever way the command ended; a create that could not be opened says exactly that. Nothing is rolled back or retried.

Runtime evidence. Module owners: four race regressions (event during a first read, burst convergence, a board taken mid-read, a query created after an earlier event), the focus policy, board-info fail/recover through the refresh, released-board keys, and the partial-write outcome. Every one was confirmed failing with its fix inverted. Browser: new owner tests/system/browser/board-occupancy.test.ts, registered in the lane inventory, proving a pane closed by its control and a pane closed by the address both release the navigator's occupancy, and that a board a person was editing is read again when they leave. It fails without the release invalidation.

One thing I could not isolate: the owner passes with onPaneRetired removed, because the released-board invalidation already covers every close where the navigator's occupancy visibly changes. onPaneRetired remains as the race-free signal for closing a pane while another still holds the same board, where the cached inventory would otherwise be wrong with nothing visible to show it. Flagged rather than claimed as proven.

Green: lint (policy and baseline), fmt:check, both tsc projects, test:modules (2718), test:repository, and the two navigator browser owners.

Browser owner corrected in 2113a5d6, awaiting its run.

Why the earlier drawing assertion had to be dropped, diagnosed from source rather than worked around: applyPageEdit only calls app.updateScene, and the reporting reducer suppresses a flush while state.userInteracted is false (reporting-reducer.ts:316, with the same gate in reporting-delivery.ts and baseline-merge.ts). A scene changed by script alone is deliberately not reported, which is why the existing write owners click the canvas first. Test setup, not a product regression. The click is back and the note write is waited for again.

The preview half was also not a proof: payments was held from the opening address until the final switch, so its server preview query was disabled throughout and the read afterwards was simply its first, which would have happened with the release invalidation removed. The owner now opens the comparison on billing and ledger so payments is held by nobody and its pre-edit picture is primed, then the person opens payments, clicks the canvas, moves the box, waits for the note, and leaves inside the minute that picture counts as fresh. The assertion waits for a preview answer whose box carries the coordinate the person moved it to, not merely a request, so a read that repeated the cached picture cannot satisfy it. The probe records response bodies for that reason. The budget's reason and evidence now name what it waits on: two closes, one note write, one preview answer.

Retirement rationale, from source and without any transport claim: the shell hears a pane has left the layout as soon as React removes it, while dispose closes the socket behind the workbench teardown (sockets.dispose().finally(connector.close) in pane-core), so a pane can be out of the layout with its socket still open and still registered, and a read taken then comes back saying it is on screen. Nothing announces the retirement afterwards, which is why the event is said from the close rather than from the layout. onPaneRetired is retained on that basis.

Still to run, once the browser slot is released: board-occupancy positive, then the same owner with the released-board invalidation inverted, to show the corrected preview assertion is load-bearing. Nothing else is outstanding.
<!-- SECTION:NOTES:END -->
