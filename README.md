# archboard

An internal architecture canvas. A live [Excalidraw](https://excalidraw.com)
board that an agent and a human build, explore, and refactor **code and
infrastructure architecture** on together — by voice, on a large touchscreen.

Not published. Not a general-purpose diagramming tool.

## What makes it different

Most agent-diagramming tools are one-way: the agent draws, you look. Archboard
is bidirectional and that is the entire point.

- The agent reads the codebase and draws the architecture
- You rearrange it — pulling two boxes apart is a statement about coupling
- The agent **reads your rearrangement back** and reasons about what it implies

Nodes bind to real code. `customData` carries the node kind and file path;
`link` makes a box tappable so it opens the file. Both survive the full
round-trip, including after you drag them.

## Status

Early. The canvas works and the round-trip is verified; the architecture
domain model on top of it is being built.

To use archboard in another repository, see [`INSTALL.md`](INSTALL.md).

To run it end to end with Codex and voice, see [`TESTING.md`](TESTING.md).

See [`DESIGN.md`](DESIGN.md) for the design and roadmap, [`CLAUDE.md`](CLAUDE.md)
for how to build and run it, and [`FLIP_WHITEBOARD.md`](FLIP_WHITEBOARD.md) for
the touchscreen setup.

## Quick start

Requires bun. It runs the TypeScript, so the server and the CLI have no build
step; only the frontend is built (ADR 0014).

```bash
bun install
bunx vite build
export ARCHBOARD_VAULT=/path/to/vault    # every board is a note in one
./bin/canvas start
```

Then open <http://127.0.0.1:3000>. The vault has no default and the canvas will
not start without one (ADR 0015); `./bin/canvas install-skill` is what chooses
one for a repository, and the refusal says so.

Every command that touches a board names it. There is no default: a pane holds
its own board and two panes hold two, so "the board" would be a guess
(ADR 0009). A fresh canvas holds `scratch`.

```bash
./bin/canvas panes                                    # which pane holds which board
./bin/canvas describe --board scratch                 # what is on it, as text
./bin/canvas query --board scratch --type rectangle   # includes customData + link
./bin/canvas export --board scratch --out diagrams/arch.excalidraw
```

## Provenance

Derived from [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
(MIT), forked at v2.0.0 (`6ddbe98`). Upstream history is retained in this repo.

Archboard is diverging deliberately and does **not** aim to stay mergeable with
upstream — changes are made for our use case without regard for whether upstream
would accept them. The `upstream` remote is kept for reference and for
cherry-picking the occasional bug fix, not as a merge target.

Both copyright notices are retained in [`LICENSE`](LICENSE) as MIT requires.
