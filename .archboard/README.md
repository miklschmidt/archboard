# Archboard's architecture vault

The files in `vault/` are the canonical, editable boards of this repository's
current architecture. Keep them in Git. Edit them through the CLI so writes,
versions, claims, and live browser announcements retain their normal guarantees.
Rendered SVGs are disposable; there is no second set of authored input files to
regenerate these boards from.
Their JSON formatting belongs to `semantic-board-store`; the source formatter
excludes these files so it cannot change a board outside its write boundary.
The authored `.archboard/config.yaml` inside the vault defines its shared levels,
node kinds, relationship kinds and appearance. Run `./bin/dogfood semantic config`
to discover that vocabulary and `./bin/dogfood check` after board work. Rendered
legends and generated editor schemas are derived artifacts, not authored boards.

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
Links explicitly follow the target board's `current` variant.

A link is a property of a part the board draws for its own sake, never a card
added to carry it, and it says the level of what it opens through its kind
(ADR 0029). So a board reaches the level above it either through the container
it describes, or through the caller it draws — and a board with neither says so
by having no upward link, which is why the breadcrumb exists.

| Level   | Board                 | Scope                                               |
| ------- | --------------------- | --------------------------------------------------- |
| System  | `Archboard`           | The processes that run, and what they keep          |
| Service | `Command interface`   | CLI application modules and its command groups      |
| Service | `Canvas server`       | Canvas server modules and the one write boundary    |
| Service | `Browser application` | Browser application modules                         |
| Service | `Agent workbench`     | Codex integration inside the server                 |
| Service | `Skill evaluation`    | The harness that measures the consumer skill        |
| Module  | `Command dispatch`    | Dispatch and invocation lifetime                    |
| Module  | `Board persistence`   | Board reads, transitions, and durable writes        |
| Module  | `Semantic renderer`   | Meaning to SVG and interaction geometry             |
| Module  | `Renderer layout`     | How one drawing is settled, and by what measure     |
| Module  | `Board rasterizer`    | One board as a PNG, through a headless browser      |
| Module  | `Board viewer`        | Reading, selection, camera, and navigation          |
| Module  | `Codex session`       | Reviewed app-server protocol operations             |
| Module  | `Codex workhorse`     | The one door into a workhorse thread, and its queue |
| Module  | `Voice coordinator`   | The separate thread voice attaches to               |

Here, service-level boards explain one application or explicitly named subsystem;
they do not imply separate deployments. The workbench lives inside the canvas
server, while Codex app-server runs as its private child, and the skill
evaluation harness is a developer tool a person starts. Module boards expand
the central implementation paths rather than inventorying every source file.
Each board includes a short walkthrough; some also offer focused views.

Board names describe architectural subjects; source paths live in node bindings.
Variants form an ancestry tree and describe the evolution of the same diagram.
Views belong to the board and remain available across every variant.

`Renderer layout` keeps `Initial` as a historical variant: the renderer as it
placed cards on a grid before the readable layout landed. Its current variant is
the layout the code now settles, so opening the board draws the two against each
other. **Render sequence**, **Sizing a card** and **Layout sequence** are its
three readings; see
[the implementation contract](../docs/design/measured-compound-renderer.md).

A historical variant is a record, not a board to maintain. `Initial`'s bindings
name files that moved out of `src/runtime/semantic-renderer/lib` in September,
and the store refuses to edit them, which is the point: what was true then does
not change.

## Maintain the architecture

These boards were rewritten against the implementation on 2026-09-17 (TASK-257).
Update the affected boards with intentional architecture changes, preserving
subject IDs.
Read with `./bin/dogfood semantic show <board>` and edit with the reported version
and `--doing`. Keep current boards about implemented behavior; branch variants
for proposals. The historical migration example in `docs/design/semantic-pipeline`
is separate from this living vault.

For an export, write outside the canonical vault, for example:

```bash
./bin/dogfood semantic render Archboard --out /tmp/archboard-system.svg
```
