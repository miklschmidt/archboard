---
id: TASK-608
title: An open tab learns of a rebuilt frontend at the next selection or navigation
status: Done
assignee: []
created_date: '2026-11-08T15:51:00Z'
updated_date: '2026-11-08T16:11:00Z'
labels:
  - bug
  - frontend
dependencies: []
references:
  - apps/server/src/server/panes/connections/routes/pane-routes.ts
  - packages/workbench/src/server/panes/services/context.ts
  - apps/web/src/ui/panes/pane-session/clients/pane-report-sender.ts
ordinal: 1061000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-056 meant an open tab to hear that the server now serves a newer frontend build at the reader's next interaction. The pane report carried that answer, and it went out on every scroll, resize and zoom. Commit bf2d25aba removed viewport and zoom from the report, so it now goes out only when the pane mounts, its options or model change, or its socket reconnects. A rebuild with `bunx vp run frontend` restarts nothing, so the tab never learns and keeps running old code without a word. The tab already publishes its reading to `/api/panes/semantic-context` at every selection and navigation, so that reply can carry the same staleness fact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A tab whose registered build differs from the built frontend gets the stale-build notice after it changes its selection or navigates, with no pane report in between
- [x] #2 A tab on the current build, on the dev server, or with no named build hears nothing from a reading
- [x] #3 The notice appears once per served build, whichever reply said it first
- [x] #4 One staleness rule answers both the pane report and the reading, and no timer or poll is added
- [x] #5 No comment or doc claims that a pane reports on every scroll, resize and zoom
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: give server-lifecycle one `staleFrontend(build)` rule beside `frontendState`, answer it from `postPaneRoute`, and answer the semantic-context route from the build the pane registered.
2. Client: move the once-per-build memory out of pane-report-sender into one per-pane notice (`state/stale-build.ts`) that both the pane report sender and the reading publisher feed.
3. Correct the comment above `postPaneRoute`, the Panes section comment and the `PANE_MS.report` doc, which said a pane reports on every scroll, resize and zoom.
4. Model: point the Pane routes -> Staleness relationship (`vKEsyHFk#4gRaPRO3`) at `staleFrontend`. No proposal: the relationship and its meaning stay the same, only its anchor symbol changed.
5. Prove it: extend the frontend staleness system owner with a reading, add a reading-publisher module case for once per build, and reproduce it in a real browser.

Review fix: share the notified build set for the lifetime of the page. Prove that late replies and another pane do not repeat a served build. Keep the registered-build route and the strict reading schema unchanged. The modeled pane routes and Staleness relationship remain accurate, so no architecture proposal is needed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The reading route reads the build the pane named at registration (`panes.get(clientId).build`), so the reading request carries no new field and the strict pane-context schema is unchanged. A pane whose registration has not landed hears it from its pane report instead.

No model module binds `packages/workbench/src/server/panes/services/context.ts`, so its new call to Staleness is not drawn. `archboard check` (`bunx vp run --no-cache check:model`) reports no warning for it. Before the anchor fix it reported ANCHOR_SYMBOL_MISSING on `vKEsyHFk#4gRaPRO3`; after it, it passes.

Site audit skipped: `site/` imports nothing from the pane session, and the change draws nothing.

Validation: `bun test` on apps/web/tests/ui/panes, apps/web/tests/ui/application, packages/workbench/tests/server, packages/server-lifecycle/tests, apps/server/tests/server (226 pass) and on the staleness, pane-context, browser-show, application-socket and package-api system owners (78 pass). Type-check, lint and format pass. Both new assertions fail without the fix.

Browser (agent-browser, private server on port 3517, examples/web-shop): with the served entry renamed on disk, selecting Orders DB sent only POST /api/panes/semantic-context and raised "This tab is running an old build". After dismissal a second selection on the same build stayed silent. A second rename raised it again naming the newer build. Reload loaded the new entry, and a selection there stayed silent.

Review of f0b71b437 against 21e391c6a: Standards pass with no verified findings. Spec review found two repeat-notice cases. A late reply across a rebuild forgets the newer build. Another pane keeps independent notice memory. Both focused regressions fail before the fix and pass after it. Notice memory now holds every announced build for the page lifetime, across panes.

The stored registration build remains valid through the inspected registration, reconnect, and vault-move paths. The strict reading schema remains unchanged. No timer or poll was added. The Pane session owner (vKEsyHFk/yejBBUFY#xsn0RvSi), Pane routes (vKEsyHFk/Oi6SBIAM#MqTq68P3), and relationship vKEsyHFk#4gRaPRO3 remain accurate. No proposal or model edit is needed.

Model read, inspect, and locality succeeded. Locality omitted nine unbound external parts. Code inspection skipped 82 subjects with unknown exposure, nine unbound subjects, and one text-only checkout. These limits remain explicit. Model validation reported no warnings or errors.

Validation inside nix develop: bun install and bun run build pass. The unrelated voice version in bun.lock was restored. The five requested module directories pass 228 tests. The three requested system and package owners pass 70 tests. Type-check, lint, format:check, and uncached check:model pass. Lint reports no warnings or errors.

The initial build reports its existing large-chunk warning. Both private servers stopped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An open tab now learns that the server serves a newer frontend build at its next selection or navigation. The semantic-context route answers the same `staleFrontend` fact as the pane report, from the build the pane named when it registered, through one `staleFrontend` rule in server-lifecycle. The client feeds both replies into one notice memory that lasts as long as the page, so each served build is announced once, across panes and late replies. No timer or poll was added. The comments that said a pane reports on every scroll, resize and zoom now describe when it reports, and the model anchor of Pane routes -> Staleness names `staleFrontend`.

Verification: the frontend staleness system owner, the reading-publisher and stale-build module owners (each fails without its fix), type-check, lint, format, and `check:model`. In a real browser, a card selection alone raised the notice, a dismissed notice stayed dismissed for the same build, a newer build raised it again, and the reloaded tab stayed silent.

Limit: `packages/workbench/src/server/panes/services/context.ts` has no model module, so its call to Staleness is not drawn.
<!-- SECTION:FINAL_SUMMARY:END -->
