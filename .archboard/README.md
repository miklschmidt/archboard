# Archboard's architecture vault

The files in `vault/` are the canonical, editable boards of this repository's
current architecture. Keep them in Git. Edit them through the CLI so writes,
versions, claims, and live browser announcements retain their normal guarantees.
Rendered SVGs are disposable; there is no second set of authored input files to
regenerate these boards from.
Their JSON formatting belongs to the board store (`packages/board/src/runtime`); the source formatter
excludes these files so it cannot change a board outside its write boundary.
The authored `.archboard/config.yaml` inside the vault defines its shared levels,
node kinds, relationship kinds and appearance. Run `archboard semantic config`
to discover that vocabulary and `archboard check` after board work. Rendered
legends and generated editor schemas are derived artifacts, not authored boards.

## Open the vault

A command finds its vault from the directory it runs in, as git finds its
repository (ADR 0049). Inside this checkout, from any directory, that is
`.archboard/vault` at the checkout root. A vault above the root is never used.
`-C <dir>` starts the search in another directory, so
`archboard -C <checkout> check` reads this vault from anywhere.
Every JSON answer names the vault it used, as `vault: {path, origin}`. Plain
`archboard` in this checkout reads this vault.

`archboard` runs the source of the archboard checkout that you are in. In a
worktree, it runs the worktree's own `bin/archboard`, even when `archboard` on
your PATH links to the main checkout. The server of the main checkout listens
on port 3000. The server of a worktree listens on its own port, from 10000
to 19999. The port comes from the worktree's path, so it does not change.
`archboard status` gives the URL.

From the checkout root:

```bash
archboard start
archboard browser show Archboard --pane primary
```

`start` prints the URL. Open `<url>/?paneA=Archboard` before the browser
command. In the main checkout, that is <http://127.0.0.1:3000/?paneA=Archboard>.
The navigator lists every repository on the machine that has a vault. The
first command that runs in this checkout registers it, and its answer says so
in `vault.registered`. Then the navigator lists this vault under
`github.com/miklschmidt/archboard`, and
`?paneA=Archboard&repoA=github.com/miklschmidt/archboard` opens the board
whichever vault the page opened in. The server starts without a vault and
serves every vault that a call names, so a running server needs no restart to
read this vault. Restart it after you change server source:

```bash
archboard stop
archboard start
```

On another machine, the first command in the checkout registers it, or run
`archboard repo add`, to resolve the boards'
`github.com/miklschmidt/archboard` code bindings. Build the frontend
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

| Level   | Board                     | Scope                                                          |
| ------- | ------------------------- | -------------------------------------------------------------- |
| System  | `Archboard`               | The processes, what they keep, and the packages in layers      |
| Service | `Command interface`       | CLI application modules and its command groups                 |
| Service | `Archboard server`        | Archboard server modules and the one write boundary            |
| Service | `Browser application`     | Browser application modules                                    |
| Service | `Codex realtime voice`    | The voice package, its Codex sessions, and its hosts           |
| Service | `Skill evaluation`        | The harness that measures the consumer skill                   |
| Module  | `Command dispatch`        | Dispatch and invocation lifetime                               |
| Module  | `Archboard server routes` | The route handlers, and what each one reaches                  |
| Module  | `Live panes`              | Pane connections, screen state and board announcements         |
| Module  | `Board persistence`       | Board reads, transitions, and durable writes                   |
| Module  | `Semantic renderer`       | Meaning to SVG and interaction geometry                        |
| Module  | `Renderer layout`         | How one drawing is settled, and by what measure                |
| Module  | `Board rasterizer`        | Pictures and recordings of a board, through a headless browser |
| Module  | `Board viewer`            | Reading, selection, camera, and navigation                     |
| Module  | `Codex session`           | Reviewed app-server protocol operations                        |
| Module  | `Codex workhorse`         | The workhorse thread, its queue, and the coordinator's door    |
| Module  | `Voice coordinator`       | The separate thread voice attaches to                          |

Here, service-level boards explain one application or explicitly named subsystem;
they do not imply separate deployments. Archboard hosts the `codex-realtime-voice` package in its server, and `apps/workbench-example` is a second host of it.
Codex app-server runs as the host's private child. The skill evaluation harness is a developer tool a person starts. Module boards expand
the central implementation paths rather than inventorying every source file.
Each board includes a short walkthrough; some also offer focused views.

Board names describe architectural subjects; source paths live in node bindings.
Variants form an ancestry tree and describe the evolution of the same diagram.
Views belong to the board and remain available across every variant.

`Renderer layout` keeps two historical variants: `Initial`, the renderer as it
placed cards on a grid, and `Readable layout`, the Graphviz engine that
[ADR 0040](../docs/adr/0040-track-and-blocks-replace-the-graphviz-engine.md)
removed. **Render sequence**, **Sizing a card** and **Layout sequence** are its
three readings.

A historical variant is a record, not a board to maintain. `Initial`'s bindings
name files that moved out of `src/runtime/semantic-renderer/lib` in September,
and `Readable layout`'s name files deleted with the Graphviz engine. Ordinary edits refuse them. If a diagram contains a factual mistake,
`semantic correct` repairs it against explicit historical Git commits and records
the reason. The architecture it describes remains the architecture of that time.

## Maintain the architecture

These boards were checked against the implementation on 2026-09-24 (TASK-328).
A task changes them through a proposal: each affected board gets one while the
task is planned, and the proposal is corrected to what was built and adopted
when the task closes. The `archboard-dev` skill gives the steps. Edit a current
variant in place only to correct a board that was already wrong. Preserve
subject IDs.
Read with `archboard semantic show <board>` and edit with the reported version
and `--doing`. The historical migration example in `docs/design/semantic-pipeline`
is separate from this living vault.

After board work, also run `archboard check --code`. When a task closes,
run it as the closing steps of `archboard-dev` say. The code check reads the
bound code
([ADR 0046](../docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md)).
It finds an anchor or a bound symbol that no longer holds. It finds a
relationship that the code does not support or runs the other way. It also
finds code of one bound part that reaches another part with no relationship
drawn. Every relationship between two bound parts carries an anchor: the one
place in code that proves it. The check judges the relationship by that line.
If a finding stays, the notes of the task that left it explain it.

To find the boards that the code has moved away from, read `behind` in the
same answer. For each board, it lists the
commits that changed a part's bound files after the board's current variant
last changed, and it lists those commits for each part
([ADR 0045](../docs/adr/0045-git-history-is-read-through-bindings-on-request.md)).
A part that drills into another board is skipped, because that board carries
its history. A count says where to look, not what is wrong, and it never fails
the check. Read the parts that the commits changed against the code. If the
board is wrong, correct it. If it is still right, leave it.

For an export, write outside the canonical vault, for example:

```bash
archboard semantic render Archboard --out /tmp/archboard-system.svg
```
