# Archboard's architecture vault

The files in `vault/` are the canonical, editable boards of this repository's
current architecture. Keep them in Git. Edit them through the CLI so writes,
versions, claims, and live browser announcements retain their normal guarantees.
Rendered SVGs are disposable; there is no second set of authored input files to
regenerate these boards from.
Their JSON formatting belongs to `semantic-board-store`; the source formatter
excludes these files so it cannot change a board outside its write boundary.

## Open the vault

From the checkout root:

```bash
./bin/dogfood start
./bin/dogfood browser show Archboard --pane primary
```

Open <http://127.0.0.1:3000/?paneA=Archboard> before the browser command.
The launcher explicitly selects this checkout's `.archboard/vault`, even when
the shell exports another project's vault. If a server is already running for
another vault, run `./bin/dogfood stop` before starting; the server retains the
vault selected at startup. Restart after changing server source:

```bash
./bin/dogfood stop
./bin/dogfood start
```

On another machine, register the checkout with `./bin/dogfood repo add` to resolve
the boards' `github.com/miklschmidt/archboard` code bindings. Build the frontend
with `bun run build` when setting up a fresh checkout, as described in
[TESTING.md](../TESTING.md).

## Read across levels

Start at `Archboard`. Select a node and use its inspector's linked-board
button. The viewer keeps a breadcrumb trail back to the board you came from.
Links explicitly follow the target board's `current` variant. Detail boards also
include a context node linked back to their containing level, so a direct URL
still has a route upward.

| Level   | Board                 | Scope                                          |
| ------- | --------------------- | ---------------------------------------------- |
| System  | `Archboard`           | Applications, owned child process, and storage |
| Service | `Command interface`   | CLI application modules                        |
| Service | `Canvas server`       | Canvas server modules                          |
| Service | `Browser application` | Browser application modules                    |
| Service | `Agent workbench`     | Codex integration inside the server            |
| Module  | `Command dispatch`    | Dispatch and invocation lifetime               |
| Module  | `Board persistence`   | Board reads, transitions, and durable writes   |
| Module  | `Semantic renderer`   | Meaning to SVG and interaction geometry        |
| Module  | `Renderer layout`     | Current and proposed layout sequences          |
| Module  | `Board viewer`        | Reading, selection, camera, and navigation     |
| Module  | `Codex session`       | Reviewed app-server protocol operations        |

Here, service-level boards explain one application or explicitly named subsystem;
they do not imply separate deployments. The workbench lives inside the canvas
server, while Codex app-server runs as its private child. Module boards expand
the central implementation paths rather than inventorying every source file.
Each board includes a short walkthrough; some also offer focused views.

Board names describe architectural subjects; source paths live in node bindings.
Variants form an ancestry tree and describe the evolution of the same diagram.
Views belong to the board and remain available across every variant.

The renderer's `Readable layout` proposal links to `Renderer layout` for call
sequences. Keep **Render sequence** selected while switching between `Initial`
and `Readable layout` to compare the implemented and proposed paths. **Pretext
sizing** and **Layout sequence** show proposed details and are empty in `Initial`.
The renderer implements this proposal with Pretext and ELK;
see [the implementation contract](../docs/design/measured-compound-renderer.md).
The board retains `Initial` and the proposal as two readings of the change;
running the new engine does not automatically adopt a proposal.

## Maintain the architecture

These boards were authored against the implementation on 2026-09-13. Update the
affected boards with intentional architecture changes, preserving subject IDs.
Read with `./bin/dogfood semantic show <board>` and edit with the reported version
and `--doing`. Keep current boards about implemented behavior; branch variants
for proposals. The historical migration example in `docs/design/semantic-pipeline`
is separate from this living vault.

For an export, write outside the canonical vault, for example:

```bash
./bin/dogfood semantic render Archboard --out /tmp/archboard-system.svg
```
