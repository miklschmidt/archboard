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

To run it end to end with Codex and voice, see [`TESTING.md`](TESTING.md).

See [`DESIGN.md`](DESIGN.md) for the design and roadmap, [`CLAUDE.md`](CLAUDE.md)
for how to build and run it, and [`FLIP_WHITEBOARD.md`](FLIP_WHITEBOARD.md) for
the touchscreen setup.

## Quick start

Requires Node >= 20. This repo uses bun; there is no npm dependency.

```bash
bun install
bunx tsc && bunx vite build
./bin/canvas start
```

Then open <http://127.0.0.1:3000>.

```bash
./bin/canvas describe                  # what is on the board, as text
./bin/canvas query --type rectangle    # structured, includes customData + link
./bin/canvas export --out diagrams/arch.excalidraw
```

## Provenance

Derived from [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
(MIT), forked at v2.0.0 (`6ddbe98`). Upstream history is retained in this repo.

Archboard is diverging deliberately and does **not** aim to stay mergeable with
upstream — changes are made for our use case without regard for whether upstream
would accept them. The `upstream` remote is kept for reference and for
cherry-picking the occasional bug fix, not as a merge target.

Both copyright notices are retained in [`LICENSE`](LICENSE) as MIT requires.
