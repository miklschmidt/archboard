---
status: accepted
---

# Library items live on the canvas server, not in browser storage

The library is the palette of reusable stencils a human drags onto a board.
Excalidraw's own host apps keep it in `localStorage`. archboard keeps it on the
canvas server, in `<vault>/.archboard/library.excalidrawlib`, and pushes it to
every connected pane over the existing socket.

`localStorage` is per browser profile and per origin, which is wrong on every
axis this app is used along:

- **Two panes are one library.** Split the shell and both canvases are the same
  human at the same wall. Two Excalidraw instances would otherwise keep two
  copies, and whichever wrote last would silently delete the other's stencils.
- **A second tab is a second machine's problem in miniature.** The Flip and a
  laptop reach the same canvas server; a stencil added on one has to be there on
  the other, because it is the same canvas.
- **The Flip is a shared appliance.** Its browser profile gets reset, cleared and
  re-provisioned as a matter of routine. A library that dies with the profile is
  a library nobody invests in.
- **An agent cannot read a browser's local storage.** Boards are on the server
  precisely so that "what is on the board" is a question with an answer;
  "what can I draw with" should be the same kind of question. `library list`
  exists because of this decision and could not exist without it.

The seven curated libraries that ship in `libraries/` follow from the same
choice: the server seeds them on first read, so they need no network fetch and
no browser has to carry them. Seeding is recorded per set, so a set the human
deletes stays deleted and an eighth set added later still reaches a vault that
already exists.

## Consequences

The library is only as durable as the vault. With no `ARCHBOARD_VAULT` set there
is nowhere to write it, and it lives for as long as the canvas server does —
boards refuse to operate without a vault, but a library has no wrong file to
overwrite, so it degrades instead of refusing.

Writes are last-write-wins. The browser reports the whole palette because
Excalidraw hands it the whole palette; there is no library delta to be had. The
result is broadcast to every client, so the window in which a second tab holds a
stale copy is the width of one round trip rather than the life of the tab.

Two things this deliberately does not do. Library items never enter a board's
element store, its baseline, or the change feed: a stencil becomes elements only
when a human drags it onto a canvas, and it arrives there through the ordinary
change-report path like anything else they drew. And nothing on the server
fetches a library URL. The browser does that, against an allowlist, so the
canvas never becomes a fetch proxy for whatever a web page put in a hash.
