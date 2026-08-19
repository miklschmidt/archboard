---
id: TASK-023
title: Ship curated Excalidraw libraries; remove the broken browse round-trip
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 21:21'
updated_date: '2026-08-19 21:28'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 23000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The seven curated libraries ship with the app and need no network fetch
- [ ] #2 The #addLibrary= round-trip works: Add to Excalidraw on libraries.excalidraw.com lands the library in archboard
- [ ] #3 An added library persists — it is not lost on reload
- [ ] #4 Library items remain usable by drag-and-drop onto a board
- [ ] #5 Attribution to the library authors is retained somewhere durable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision first: library items live on the SERVER, next to boards, not in browser
localStorage. A vault-backed file `<vault>/.archboard/library.excalidrawlib`;
in-memory when no vault is set. Reasons: two panes and several tabs see one
library instead of N; a second machine pointed at the same canvas server gets
the same stencils; the Flip is a shared appliance where a browser profile reset
is routine and would silently wipe it; and it makes the library readable by the
agent (`library list`), which localStorage never could be.

1. Move `frontend/libraries/*.excalidrawlib` -> `libraries/` (the server, not the
   bundle, now owns them) and write `libraries/README.md` carrying each file's
   author, source URL and item count. Attribution is tracked, not derived.
2. `src/core/library.ts` — the store. Parses both .excalidrawlib versions
   (v1 `library: elements[][]`, v2 `libraryItems: LibraryItem[]`) into v2 items
   with ids derived from sha256(set:index), so seeding is idempotent. Seeds any
   curated set not already named in the store's `seeded` list, so a set the human
   deleted stays deleted and an eighth set added later still lands.
3. Server: `GET /api/library`, `PUT /api/library`, plus a boardless
   `library_changed` broadcast so a second tab/pane follows along. Library items
   never touch a board's element store or the change feed.
4. Frontend: the shell owns library items (it is chrome, like board identity);
   panes receive them and report back. `#addLibrary=` is handled once per page in
   the shell, prompting the human with the host and item count before install.
   Fetch policy: https only, host allowlist (excalidraw.com and its subdomains,
   raw.githubusercontent.com/excalidraw/excalidraw-libraries), re-checked after
   redirects, 8MB cap, `credentials: 'omit'`; the response is parsed as JSON and
   run through Excalidraw's own `restoreLibraryItems` (which sanitises element
   links) — never eval'd, never stored as-is. The browser fetches, not the
   server, so archboard never becomes an open fetch proxy.
5. `./bin/canvas library list|show` so the agent can read what is in the library.
6. ADR 0007 recording where library items live; CONTEXT.md gains "Library" as a
   term so it stops being a word we only tell people to avoid.
7. Verify: bun run test, type-check, and in Chrome — seven libraries present
   offline, a real Add to Excalidraw round-trip from libraries.excalidraw.com,
   survives reload, dragged item becomes plain elements that `describe` sees.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:22
---
User chose fixing the round-trip over removing the button: 'the add to excalidraw button doesn't work' was the complaint, and making it work means any library found later needs no code change.

Also from the user, on bundling: 'I don't care about bundle size, this is an app, not a website.' So vendoring the .excalidrawlib files into the build is fine — 1.2MB across seven, 111 items.

The seven are already vendored at frontend/libraries/.
---
<!-- COMMENTS:END -->
