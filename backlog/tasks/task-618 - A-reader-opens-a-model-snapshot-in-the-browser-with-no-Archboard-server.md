---
id: TASK-618
title: A reader opens a model snapshot in the browser with no Archboard server
status: Done
assignee:
  - '@claude'
created_date: 2026-11-09 01:20
updated_date: '2026-11-09T06:14:00Z'
labels:
  - frontend
dependencies:
  - TASK-616
  - TASK-617
references:
  - apps/web/src/main.tsx
  - apps/web/src/ui/architecture-drawing/model-reader/access/clients/queries.ts
  - >-
    apps/web/src/ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts
  - apps/web/src/ui/walkthroughs/replay/clients/start-replay.ts
ordinal: 1064000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A snapshot file is only useful if a reader can open it where it is shared. The canvas already draws in the browser from a reading (projectModel, then the renderer core and the painter), but it reads that reading, the vault check and the icons from the server, and only walkthrough replay installs a local source. A read-only page that takes a snapshot instead of a server lets a team host the canvas on any static file host.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A second page of the browser build, snapshot.html, opens the snapshot that its snapshot query parameter names
- [x] #2 The page draws the snapshot state with the renderer core and the painter, and shows its comparison state when the snapshot has one
- [x] #3 The page sends no request to /api and opens no socket
- [x] #4 The page offers no action that writes, and it loads no agent, workbench or voice code
- [x] #5 A snapshot of an unknown format version shows which format versions the page reads
- [x] #6 The page follows the light or dark preference of the system
- [x] #7 A rendered test proves that the page reads a fixture snapshot without a server request
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add snapshot.html as a second Vite entry (apps/web/src/snapshot.tsx), with a relative icon link so a static host serves every file from the build's directory.
2. ui/snapshot-reader: rules/snapshot-file.ts reads the address (snapshot parameter, resolved against document.baseURI) and the file (ModelSnapshotSchema, a refusal that names the readable format versions). clients/snapshot-reads.ts fetches the file in one query, installs the existing retained-reads provider (vault check from the file, no code findings) and starts the renderer with the file's icons. clients/system-preferences.ts follows the system theme.
3. SnapshotCanvas reuses projectModel, useAcceptedScene, useModelSelection, usePictureCamera and ModelDiagram; SnapshotHeading names the model, the open scope, the state and the comparison state.
4. Renderer: startBrowserRenderer({ icons }) reads icons from the page instead of fetching them, so the package width stays at its ceiling.
5. tools/snapshot-page-boundary.ts fails the build when a chunk the page can load holds workbench, voice or codex app server modules.
6. Browser owner tests/system/browser/snapshot-page.test.ts on a static host. Vault parts on Current, README embeds, docs and the archboard skill.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- Read seam: the page installs the existing readRetainedFrom provider with the snapshot's vault check and no code findings. The model readings need no query: SnapshotCanvas projects the snapshot's reading against its comparison reading with projectModel, as ModelWalkthrough does, and draws it with useAcceptedScene and ModelDiagram. No second copy of the canvas.
- Icons: a new readIconsFrom export put the renderer at 59 names, over its ceiling of 58 (ADR 0058). startBrowserRenderer now takes an optional icons set instead, and the page starts the renderer once the file is read; its chunk is fetched while the file loads.
- Comparison: the picture wears the comparison standing marks (added, changed, removed), and the heading names the comparison state. A reader opens a module with a double click and steps back through the heading's crumbs. Nothing writes.
- Reduced motion is read once when the snapshot opens (clients/system-preferences.ts). Importing the app's live hook from application/hooks reached Application composition, which has no part for that file, and check:model warned.
- The vite chunk names prove nothing: rolldown groups pull the dependencies of workbench modules (zod, model schemas) into chunks named agent~. So the build check reads the module ids of every chunk that the snapshot entry imports, at once or later.
- The application page has no favicon link and asks the host root for favicon.ico. snapshot.html links its icon relatively, so a static host serves it from the build.

Vault (Current): added Snapshot page (apps/web/src/ui/snapshot-reader) and Snapshot page start (apps/web/src/snapshot.tsx) under Browser, with relationships to Canvas reads, Browser drawing, Model snapshot contract, Shared model projection, Model diagram, Repository queries, Pane vault and Camera controller. Changed the responsibilities of Icon loading and Canvas reads. Redrew the README architecture embeds. check:model passes. The information findings that still name the snapshot page are in lists that already name many callers: model, Canonical model reader (reached through model-reader hooks and rules that no part binds), and Shared components. Fixing them needs parts for code this change does not add, so they stay.

Evidence: tests/system/browser/snapshot-page.test.ts 'the snapshot page draws a snapshot and its comparison from a static host, with no server' writes the snapshot with archboard model snapshot from examples/canonical-model, stops the server, and serves dist/frontend and the file from a static host under /project/. It proves #1 and #7 (snapshot.html?snapshot=snapshots/draft.snapshot.json draws), #2 (layout worker and core load from the build; Shop#Gateway wears data-semantic-standing=changed; the heading names the comparison state), #3 (the host received no /api path, no WebSocket upgrade and no icon request; the application page served beside it does ask the host for /api), #5 (a format 2 file shows a refusal naming versions 2 and 1 and draws nothing) and #6 (set media light, then dark, moves data-theme live). #4: the page has no write control and every request is a GET of the build or the file (same test); tools/snapshot-page-boundary.ts fails vp build when any chunk the snapshot entry imports, statically or later, holds a module of packages/workbench, packages/codex-realtime-voice, packages/codex-app-server or @assistant-ui. Checked that it fails when its pattern matches a module the page does load.

Lanes (nix develop): format:check pass; types pass; lint:tests 0/0; lint:policy 0/0; test:repository 170 pass; test:modules 5029 pass, 1 skip; test:system 282 pass; test:serial-browser 72 pass across 51 owners; check:model pass. Screenshots: snapshot-light.png, snapshot-dark.png, snapshot-scope-light.png, snapshot-refused-dark.png in the session scratchpad.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
snapshot.html is a second page of the browser build. It reads the file that its snapshot parameter names, resolved against the page, and draws the selected state against its comparison state with the reader's own diagram, the renderer core and the painter. The existing retained-reads provider answers the vault check and code findings from the file, and startBrowserRenderer takes the file's icons, so the page sends no server request. A reader opens a module with a double click and steps back through the heading. A file of another format version names the readable versions. The theme follows the system. A build check refuses agent, workbench or voice code in any chunk the page can load. One browser owner proves the page on a static host with no server. Risks: reduced motion is read once when the snapshot opens, not followed live. Follow-up: a deploy guide for static hosts is not part of this task.
<!-- SECTION:FINAL_SUMMARY:END -->
