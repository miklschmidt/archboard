# Archboard Skill Cheatsheet

## Defaults

- Canvas base URL: `EXPRESS_SERVER_URL` (default `http://127.0.0.1:3000`); CLI also accepts `--url <canvasUrl>`
- Board vault: `ARCHBOARD_VAULT` (no default — the canvas refuses to start until it is set)
- Canvas health: `GET /health` or `archboard status`
- Auto-start: any canvas-touching CLI command starts the server if it's down (opt out with `EXCALIDRAW_NO_AUTOSTART=1`)

## CLI Reference

`archboard <command>` (or `./bin/canvas <command>` inside the archboard checkout).
JSON results on stdout — except `describe` (plain text) and raw-content output when `--out` is omitted (`export` scene JSON, `screenshot --format svg`). Diagnostics on stderr. Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required, 5 board write refused. Explicit `start` overrides `EXCALIDRAW_NO_AUTOSTART=1`.

Tested producer-to-consumer extractions are in `cli-workflows.md`.

**`--board <key>` is global and required on every command that touches a board** — `add`, `apply`, `get`, `query`, `update`, `delete`, `describe`, `export`, `import`, `mermaid`, `share`, `clear`, `snapshot`, `promote`, `demote`, `changes`, `arrange`, `library insert`, `board save`, `board info`, `claim`, `release`. There is no default board and no fallback: a pane holds its own board, two panes hold two, so a call that names none is refused with the open boards listed (ADR 0009). Commands about the browser rather than a board — `panes`, `pane close`, `selection`, `screenshot`, `viewport`, `status`, `board list`, `library list`, `compare` — take no board. `pane open` takes an optional `--board`: the board to put in the new pane.

**`--doing "..."` is global and required on every command that changes a board** — `add`, `apply`, `update`, `delete`, `clear`, `import`, `mermaid`, `promote`, `demote`, `arrange`, `library insert`, `snapshot restore`, `board save`. One short line, present tense: "adding the payment queue". It goes up on the canvas as the write lands, so the person at the board can see what is happening; a write without it is refused with `DOING_REQUIRED` and nothing is written. Over 140 characters is refused too. It is never written into the board. Reading commands take none, and neither does a person dragging a box. A claim's `--reason` is the campaign; this is the step.

**Every write goes against the version of the board its writer last saw, and is
refused with `BOARD_VERSION_CONFLICT` if the board moved in between** — nothing
written, both versions named, with the current `document` and `version` attached.
Use those instead of reading the board again. You carry no number under a claim:
the canvas remembers what it last told that identified writer. A CLI process
with no claim is anonymous, so there `--expect-version <n>` is how you state it (global,
same commands as `--doing`); claiming the board is how you stop having to. A
person at a pane is never checked. This orders archboard's own writers and no
others: the note's sha-256 is what refuses a write over Obsidian's edit, and it
runs whatever else is true.

### Server

| Command  | Description                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| `start`  | Start the canvas server (detached); prints URL + pid                                     |
| `stop`   | Stop the canvas server (identity-checked via `/health` — never signals foreign services) |
| `status` | Health, element count, connected browser tabs                                            |

### Elements

| Command                     | Description                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `add [file\|-]`             | Batch create from a JSON array (file, `-`, or piped stdin); `--one '{...}'` for a single element                                       |
| `apply [file\|-]`           | Multi-op patch `{"create":[...],"update":[{"id":"a","set":{...}}],"delete":["id",...]}` in one call                                    |
| `get <id>`                  | Get one element                                                                                                                        |
| `query`                     | `--type rectangle` `--bbox x0,y0,x1,y1` `--filter locked=true` (typed; nested keys like `label.text=API` work) `--filter-json '{...}'` |
| `update <id> --set '{...}'` | Update one element                                                                                                                     |
| `delete <id> [...]`         | Delete elements                                                                                                                        |

### Scene

| Command                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `describe`                                                                   | AI-readable scene summary (ids, positions, labels, connections) — plain text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `screenshot`                                                                 | PNG/SVG capture of one pane; `--out f.png`, `--format png\|svg`, `--no-background`, `--pane <spec>`; PNG without `--out` → temp file path in JSON, SVG without `--out` → raw SVG. With two panes open, name the one you drew in or you photograph the other (**browser tab required**)                                                                                                                                                                                                                                                                                                            |
| `export [--out f.excalidraw] [--format json\|obsidian]`                      | Scene as .excalidraw JSON (stdout without `--out`); a `.md` out path writes Obsidian's .excalidraw.md format                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `import [file\|-] [--replace]`                                               | Import .excalidraw JSON or Obsidian .excalidraw.md (merge by default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mermaid [file\|-]`                                                          | Render Mermaid onto the canvas (**browser tab required**)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `share`                                                                      | Encrypted upload → shareable excalidraw.com URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `clear --yes`                                                                | Wipe the canvas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `snapshot save\|list\|restore [name] [--force]`                              | Named canvas snapshots; a snapshot belongs to the board it was taken on, and `--force` restores it onto a different one                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `changes [--since <cursor>] [--coalesce] [--detail] [--text]`                | What the board became since a cursor, in `compare`'s vocabulary. One drag is one event; a nudge or a recolour is none. `--coalesce` gives one net diff since the cursor, which is what a once-per-turn read wants. Cursors belong to a canvas process, so watch `feedId`.                                                                                                                                                                                                                                                                                                                         |
| `board list`                                                                 | Boards in the vault, boards open in this session, and which board each pane is showing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `board info --board <key>`                                                   | Identity and save state of one board                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `board new <name> [--variant v] [--level l] [--pane <spec>]`                 | Empty board; its note appears when you draw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `board open <name[@variant]> [--reload] [--pane <spec>]`                     | Show a board in a pane. `--pane` takes `left`, `right`, `top`, `bottom`, a 1-based position, `primary`, or a pane id — required when more than one pane is open, since which half of the screen is not something to guess                                                                                                                                                                                                                                                                                                                                                                         |
| `board save --board <key> [--as <name>] [--variant v] [--level l] [--force]` | Write it to the vault; **refused (exit 5) if the note changed on disk** — `--force` overwrites anyway. `--variant v` is how a board is **branched** into a proposal: it writes `<key>@v` and carries the level across. `--as` branches the same way, level included. **A branch moves nothing on screen** (ADR 0012): the panes holding the source keep holding it, and the branch is not showing until `pane open --board <key>@v` or `board open`. The answer says which — `saveKind`, `savedFrom`, `panes.moved`, `panes.kept`. Naming the scratch board is the one save that does move a pane |
| `compare <from> [to]`                                                        | Semantic diff between two variants, joined on node identity; opens nothing and leaves the canvas alone. One address finds the other variant itself                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### One writer at a time

Every write takes the board and gives it back, and a write that lands inside somebody's gesture waits for them. These two are for work that does not fit one write. **When to reach for them is judgement, and SKILL.md's "One writer at a time" is where it lives.**

| Command                                                   | Description                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claim --board <key> --reason "..." [--for 90s\|10m\|1h]` | Hold a board across everything you are about to do to it. `--reason` is required and is what the person's pane shows them; `--for` needs a unit, and a bare number is refused. Carry nothing: every write naming this board goes under the claim. Claiming again extends it and updates the reason; a write does not |
| `release --board <key>`                                   | Give it back. A claim that expired, or that somebody took back, has already ended, so releasing it is not an error — it answers `released: false`                                                                                                                                                                    |

### Panes and camera

A pane is a slot holding one board, and two panes are how the architecture that exists sits beside a proposal. All four of these need a browser tab and exit 4 without one: a pane exists only while a tab renders it.

| Command                                                       | Description                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `panes [--text]`                                              | Read-only: which pane holds which board, where it sits, how much is in view, what is picked there                                                                                                                                                                                                                                            |
| `pane open [--board <key>]`                                   | Make a **new** pane and open that board into it — the whole side-by-side move in one command. It cannot be aimed at an existing pane, so it cannot overwrite the board somebody is reading. Without `--board` the new pane shows whatever was already on screen. Two panes is the limit                                                      |
| `pane close <spec>`                                           | Close one pane. `spec` is `left`, `right`, `top`, `bottom`, a 1-based position, `primary`, `focused`, or a pane id, and is **always required** — which board comes off the screen is not something to guess. The board is untouched and stays open on the canvas; the last pane cannot be closed                                             |
| `viewport --fit \| --ids a,b,c \| --element <id> \| --zoom n` | Point one pane's camera; exactly one of the four. `--fit` frames the whole board, `--ids` frames those elements, `--element` centres on one without changing zoom, `--zoom` with `--offset-x`/`--offset-y` sets it by hand. `--zoom-factor f` is the padding on a fit, so it needs `--fit` or `--ids`. `--pane <spec>` says which half moves |

### Stencil Library

| Command                                                                  | Description                                                                                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library list [--text]`                                                  | The palette of ready-made shapes: name, source library, size, element count, and the words drawn inside each — enough to choose one without rendering it |
| `library insert <name> --x <x> --y <y> [--source <lib>] [--id <itemId>]` | Copy a stencil onto the canvas with its top-left at `--x,--y`, as ordinary elements. A name several libraries use exits 2 with the candidates named      |

### Arrange

| Command                                                                   | Description                                  |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| `arrange align --ids a,b,c --to left\|center\|right\|top\|middle\|bottom` | Align (≥2 ids)                               |
| `arrange distribute --ids a,b,c --to horizontal\|vertical`                | Even spacing (≥3 ids)                        |
| `arrange group --ids a,b` / `arrange ungroup --group <groupId>`           | Group membership lives on element `groupIds` |
| `arrange lock\|unlock --ids a,b`                                          | Toggle edit lock                             |
| `arrange duplicate --ids a,b [--offset 20,20]`                            | Clone with offset                            |

### Meta

| Command                       | Description                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install-skill`               | Install this skill into `~/.agents/skills` (replaces any existing copy); `--agent claude-code` or `--target claude` uses `~/.claude/skills`, and `--dir <skills-root>` names another root |
| `help [command]`, `--version` | Usage and version                                                                                                                                                                         |

## Canvas REST API (HTTP)

### Elements

| Method   | Endpoint                        | Description                                                     |
| -------- | ------------------------------- | --------------------------------------------------------------- |
| `GET`    | `/api/elements`                 | List all elements                                               |
| `GET`    | `/api/elements/:id`             | Get element by ID                                               |
| `POST`   | `/api/elements`                 | Create element                                                  |
| `PUT`    | `/api/elements/:id`             | Update element                                                  |
| `DELETE` | `/api/elements/:id`             | Delete element                                                  |
| `DELETE` | `/api/elements/clear`           | Clear all elements                                              |
| `GET`    | `/api/elements/search?type=...` | Search with filters (exact string match + bbox)                 |
| `POST`   | `/api/elements/batch`           | Batch create                                                    |
| `POST`   | `/api/elements/changes`         | Browser change report: {upserts, deletes} merged into the board |
| `POST`   | `/api/elements/from-mermaid`    | Mermaid conversion via frontend                                 |

### Export

| Method | Endpoint                   | Description                           |
| ------ | -------------------------- | ------------------------------------- |
| `POST` | `/api/export/image`        | Request image export (needs frontend) |
| `POST` | `/api/export/image/result` | Frontend posts export result back     |

### Viewport

| Method | Endpoint               | Description                                                                                                                                                             |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/viewport`        | Set viewport/camera; body may include `scrollToContent`, `scrollToElementIds`, `viewportZoomFactor`, `scrollToElementId`, `zoom`, `offsetX`, `offsetY` (needs frontend) |
| `POST` | `/api/viewport/result` | Frontend posts viewport result back                                                                                                                                     |

### Boards

Every element endpoint **requires** `?board=<key>`; without it the answer is 400 with `code: "BOARD_REQUIRED"` and the open boards under `open`. There is no active board (ADR 0009).

Any answer about a board whose note changed underneath carries `held`: the conflict, when the board stopped saving, how many changes are held on the canvas since, and the three commands that end it. Writes are taken while it is held; none of them reaches the vault.

| Method | Endpoint                        | Description                                                                                                                              |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/boards`                   | Vault listing + open boards + what each pane is showing                                                                                  |
| `GET`  | `/api/boards/info?board=`       | Identity and save state of one board                                                                                                     |
| `POST` | `/api/boards/open`              | `{board, variant?, level?, reload?, pane?}` — shows it in one pane, and answers with which                                               |
| `POST` | `/api/boards/new`               | `{board, variant?, level?, pane?}` — empty, unsaved                                                                                      |
| `POST` | `/api/boards/save`              | `?board=` plus `{name?, variant?, level?, force?}` — writes the note; **409 + `conflict` if it changed on disk**                         |
| `GET`  | `/api/boards/compare?from=&to=` | Semantic diff between two boards; read-only, never opens or switches a board. `to` optional when the board has exactly one other variant |

### Snapshots

| Method | Endpoint               | Description            |
| ------ | ---------------------- | ---------------------- |
| `POST` | `/api/snapshots`       | Save snapshot `{name}` |
| `GET`  | `/api/snapshots`       | List snapshots         |
| `GET`  | `/api/snapshots/:name` | Get snapshot by name   |

### System

| Method | Endpoint           | Description                                            |
| ------ | ------------------ | ------------------------------------------------------ |
| `GET`  | `/health`          | Health check (`websocket_clients` = open browser tabs) |
| `GET`  | `/api/sync/status` | Memory/WebSocket stats                                 |

## Design Guide (quick version)

Stroke/fill pairs: `#e03131`/`#ffc9c9` red, `#2f9e44`/`#b2f2bb` green, `#1971c2`/`#a5d8ff` blue, `#9c36b5`/`#eebefa` purple, `#e8590c`/`#ffd8a8` orange, `#0c8599`/`#99e9f2` cyan, `#868e96`/`#e9ecef` gray.
Styling: `"fillStyle": "solid"` for crisp flat fills (default is sketchy hachure); `"strokeStyle": "dashed"` for zone borders / async arrows.
Fills: a rectangle/ellipse/diamond created without a `backgroundColor` gets a neutral white solid fill, because a transparent shape is only selectable on its stroke. Say `"backgroundColor": "transparent"` to opt out. `promote` repaints an uncoloured node in its kind's pastel.
Sizing: shapes ≥ 120×60 with width ≥ `labelChars * 12`, fonts ≥ 16 (titles ≥ 20), gaps 40–80px (120px+ for labeled arrows), align to a 20px grid.
Order of work: background zones → primary shapes (with `text`) → arrows (bound via ids) → annotations → refine (align/distribute/screenshot).
