---
status: accepted
---

# Board work never depends on a browser session

ADR 0009 removed the ambient active-board pointer, which was correct, but it
also mixed board authority with browser display state. That made loading,
rendering, Mermaid conversion, selection-based writes, and several ordinary
workflows depend on an open pane or connected browser. This ADR supersedes ADR
0009 in full. It retains explicit board naming and removes the browser
dependency.

## Decision

Every board operation names its board explicitly. The server resolves that
board's note from the configured vault when the operation begins. It does not
require a prior open, load, or show step, and it does not consult panes, focus,
selection, cameras, or browser connections. Creating a board creates its note.
Board inventory reports persisted board facts, not where a board happens to be
displayed.

Board writes use the existing locked, synchronous note boundary. After a write
commits, the server sends the result to connected panes that already display
the board. That notification keeps a present human's canvas current, but its
delivery or acknowledgement is not part of the transaction and cannot change
the command result.

Board rendering and Mermaid conversion are board operations. PNG, SVG, and
finding close-ups are produced from one immutable named-board snapshot by a
server-owned renderer. Mermaid output passes through the canonical inbound
converter and reaches the note as one board write. Neither operation delegates
work to a user's pane.

The renderer uses Bun or Node DOM and canvas emulation by default. A bounded
proof may justify isolated, server-owned headless Chromium when emulation has a
material fidelity or reliability defect in a reachable Archboard workflow.
That fallback owns its lifecycle and never attaches to, selects, or manipulates
the user's browser session. A real browser remains valid evidence for browser
behavior and Excalidraw round-trip fidelity, but it is not a runtime
prerequisite for board work.

TASK-143.08.06.01 measured `@excalidraw/excalidraw` 0.18.1,
`@excalidraw/mermaid-to-excalidraw` 2.2.2, and Mermaid 11.17.2 on Bun 1.4.0.
Bun with `happy-dom` 20.13.2 and `@napi-rs/canvas` 1.0.8 rendered the
representative PNG and SVG fixture, but converted a valid three-node Mermaid
flowchart into an empty element list. Its malformed-input path did reject, so
this is a silent reachable-workflow loss rather than a clean unsupported case.
An isolated Chromium 150.0.7871.186 process produced five Mermaid elements and
identical PNG and SVG bytes in two zero-client runs. The full record, including
memory and cleanup measurements, is `docs/design/server-rendering-boundary.md`.

Archboard therefore selects one server-owned, isolated headless Chromium
renderer for board rendering and Mermaid conversion. Its implementation must
have one private profile, loopback-only control, bounded requests, process-group
cleanup, and serialized immutable snapshots. It must fail a non-empty Mermaid
input that produces no elements before any write reaches the note. Browser
capture remains a separate operation against a live user browser.

Live browser state has its own explicit `archboard browser` command family. It
owns pane inventory and lifecycle, which board a pane displays, selection,
camera control, and capture of what a live pane shows. These operations may
read a named board for presentation, but they never change its note. The former
top-level browser commands and pane-changing board options are removed rather
than aliased.

A board command never uses live selection as an implicit element target. A
caller may read `browser selection` and deliberately pass the returned element
identities to a later board command. Named-board rendering is a board render;
capturing a live pane and camera is a browser capture. The two are separate
contracts.

## Rejected alternatives

**Keep `board open` as a browser-free loading step.** The note already contains
the board. Requiring transient registration adds hidden ordering and makes the
same named command behave differently after a server restart.

**Keep the old command names and group only their help text.** That leaves two
overlapping models and lets scripts continue to mix board and browser state.

**Render through whichever user pane is available.** It fails when no browser
is connected and risks changing what the person sees in order to perform board
work.

**Make headless Chromium the renderer without proof.** It adds a browser
process, startup cost, and lifecycle ownership before evidence says they are
necessary. The measured Mermaid loss now satisfies the fallback condition: its
lifecycle cost is lower than silently accepting a valid conversion that writes
nothing. It remains server-owned rather than becoming a user's browser.

## Consequences

- A configured vault and server are sufficient for every board workflow.
- `board new`, board reads and writes, Mermaid conversion, inspection, export,
  and board rendering work with zero browser clients.
- `archboard browser` is the only command family that may require a connected
  browser or consume live session state.
- `board save` and branching never move panes. Showing a board is a browser
  operation, including the old scratch-save exception from ADR 0012.
- ADR 0015 remains authoritative: the note is the board. Lazy resolution reads
  that note rather than creating another current copy.
- TASK 121's browser-mediated findings renderer is replaced, while its
  persisted-snapshot and immutable-render requirements remain.
- The command registry and repository checks enforce the split. A board command
  with a browser prerequisite or implicit browser input, or a browser command
  that writes a note, is invalid.
