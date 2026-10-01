---
status: accepted
---

# Library items live on the Archboard server, not in browser storage

The library is the palette of reusable stencils that a human drags onto a board.
Excalidraw's own host apps keep it in `localStorage`. archboard keeps it on the
Archboard server, in `<vault>/.archboard/library.excalidrawlib`. The server
pushes it to every connected pane over the existing socket.

`localStorage` is per browser profile and per origin. That is wrong on every
axis along which this app is used:

- Two panes are one library. If a human splits the shell, both canvases are the
  same human at the same wall. Without a shared library, two Excalidraw
  instances keep two copies. Whichever instance writes last silently deletes the
  stencils of the other.
- A second tab is a second machine's problem in miniature. A desktop browser and
  a laptop reach the same Archboard server. A stencil added on one must be there
  on the other, because it is the same canvas.
- Browser profiles are disposable. A browser profile can be reset, cleared and
  re-provisioned as a matter of routine. A library that dies with the profile is
  a library that nobody invests in.
- An agent cannot read the local storage of a browser. Boards are on the server
  so that "what is on the board" is a question with an answer. "what can I draw
  with" must be the same kind of question. `library list` exists because of this
  decision and cannot exist without it.

The seven curated libraries that ship in `libraries/` follow from the same
choice. The server seeds them on first read, so they need no network fetch and
no browser has to carry them. Seeding is recorded per set. A set that the human
deletes stays deleted. An eighth set added later still reaches a vault that
already exists.

## Consequences

The library is only as durable as the vault. If `ARCHBOARD_VAULT` is not set,
there is nowhere to write the library. The library then lives for as long as the
Archboard server does. Boards refuse to operate without a vault. A library has
no wrong file to overwrite, so it degrades instead of refusing.

Writes are last-write-wins. The browser reports the whole palette because
Excalidraw hands it the whole palette. There is no library delta to be had. The
server broadcasts the result to every client. The window in which a second tab
holds a stale copy is therefore the width of one round trip, not the life of the
tab.

This design deliberately does not do two things. Library items never enter the
element store of a board, its baseline, or the change feed. Only a human who
drags a stencil onto a canvas turns it into elements. It arrives there through
the ordinary change-report path, like anything else that the human drew. Also,
nothing on the server fetches a library URL. The browser does that, against an
allowlist. The canvas therefore never becomes a fetch proxy for whatever a web
page put in a hash.
