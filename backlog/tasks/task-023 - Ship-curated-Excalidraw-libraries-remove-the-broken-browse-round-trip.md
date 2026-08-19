---
id: TASK-023
title: Ship curated Excalidraw libraries; remove the broken browse round-trip
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 21:21'
updated_date: '2026-08-19 21:48'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 23000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The seven curated libraries ship with the app and need no network fetch
- [x] #2 The #addLibrary= round-trip works: Add to Excalidraw on libraries.excalidraw.com lands the library in archboard
- [x] #3 An added library persists — it is not lost on reload
- [x] #4 Library items remain usable by drag-and-drop onto a board
- [x] #5 Attribution to the library authors is retained somewhere durable
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Both halves work; verified in Chrome against a real round-trip
through libraries.excalidraw.com, not just a green build.

WHERE LIBRARY ITEMS LIVE — the server, recorded as ADR 0007.
`<vault>/.archboard/library.excalidrawlib`, seeded from `libraries/` on first
read, pushed to every pane over the existing socket as a boardless
`library_changed`. Reasons: two panes are two localStorages and the last writer
would silently delete the other's stencils; a second tab and a laptop reach the
same canvas server and must see the same palette; the Flip is a shared appliance
whose browser profile gets reset as routine; and an agent cannot read a
browser's local storage, which is why `library list` can exist at all. Cost of
the choice, stated in the ADR: the palette is only as durable as the vault (no
vault = in-memory for the life of the process, a degrade rather than a refusal,
because unlike a board there is no wrong file to overwrite), and writes are
last-write-wins since Excalidraw hands the host the whole palette and there is
no library delta to be had.

FETCHING AN ARBITRARY URL — `frontend/src/shell/addLibrary.ts` holds the whole
policy. https only (Excalidraw's own validator compares host and path and never
looks at the scheme); host allowlist of excalidraw.com + subdomains and
raw.githubusercontent.com/excalidraw/excalidraw-libraries; the allowlist is
re-checked against `response.url` so a redirect cannot walk out of it; no
credentials, no referrer, 8MB cap; parsed as JSON, required to declare
`type: "excalidrawlib"`, then handed to Excalidraw's own `restoreLibraryItems`,
which is what sanitises element links. The BROWSER fetches, never the server, so
archboard never becomes a fetch proxy for whatever a page put in a hash. And it
always prompts: Excalidraw skips its confirm when the returning token matches
the instance that opened the library site, but that token arrives in the same
untrusted hash as the URL and proves nothing.

SHIPPED — `libraries/` (moved out of `frontend/`, since the server owns them and
the browser never needs them) with `libraries/README.md` carrying per-file
attribution, corrected against the upstream index: two of the seven authors were
not who they looked like from the filenames. Provenance is also in the data, as
`archboard.origins` in the store, pruned when a stencil is deleted — 100 of the
111 have no name in the v1 format, so the set they came from is the only thing
that tells them apart.

SEEDING is per set and recorded, so a set the human deletes stays deleted and an
eighth set added later still reaches a vault that already exists. Item ids are
the file's own when it has them (so re-installing that library from the site
merges rather than duplicates) and sha256(set:index) when it does not.

NOT DONE, deliberately: the library never touches the element store, the
baseline or the change feed. A dragged stencil arrives as ordinary elements
through the normal change report — verified: `describe` reported the dropped
UML box as 2 plain elements tagged frontend_sync, with no library metadata.

OVERLAP TO FLAG: TASK-026 assumed `src/cli/run.ts` was untouchable while this
was live, so it plans to register a library command. One now exists —
`library list [--text]`, listing name, size, and the curated set each stencil
came from. TASK-026 should extend it with insertion rather than add a second
command. TASK-025's premise that "library items live in the frontend" is no
longer true, which makes its catalogue work considerably easier.

VERIFIED IN THE BROWSER
- Seven libraries present in the sidebar with no network fetch (111 stencils).
- Browse libraries -> Add to Excalidraw on libraries.excalidraw.com returned to
  the SAME tab (main.tsx now sets window.name, or the site opens a second copy
  of archboard), prompted "UML ER library — 21 shapes from
  libraries.excalidraw.com", installed on accept: 132 items on the server.
- Survives reload: 132 after a full reload, and localStorage holds nothing but
  archboard-theme.
- Dragged one onto the board: 2 plain elements, seen by describe, no metadata.
- Cross-client: a curl PUT from outside the browser removed the 21 and the open
  tab's sidebar updated over the socket without a reload.
- Refusals: evil.example.com and http:// on an allowed host both refused with
  the host named, hash cleared, no fetch made.

bun run test (now including 26 new library store checks in
scripts/check-library.mjs) and bun run type-check both pass.

KNOWN COST: opening the library sidebar with 111 stencils takes several seconds
— Excalidraw renders a preview per item. Noted in the archboard-dev skill so it
is not misread as the sync path hanging.

Orchestrator note: the agent attributed two stray commits to Backlog auto-commit. That is wrong and worth correcting — auto_commit is false. It was me: I ran 'git add -A' while agents were live in the tree, so 924 lines of this task's source landed under commit a0235cf, whose message says 'File TASK-025'. The code is intact and pushed; only the history is misleading. Not rewriting it, because two agents are still working in this tree and a rebase under them would be worse than an untidy log.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Seven curated libraries ship with the app and the #addLibrary= round-trip works. Library items live on the canvas server at <vault>/.archboard/library.excalidrawlib rather than in browser localStorage (ADR 0007), so every pane, tab and machine sees one palette and an agent can read it — 'library list' only exists because of that choice. The browser, never the server, fetches an added library, under an https-only host allowlist re-checked against the redirect target, and always prompts.
<!-- SECTION:FINAL_SUMMARY:END -->
