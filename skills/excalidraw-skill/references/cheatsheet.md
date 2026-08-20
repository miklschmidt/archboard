# Excalidraw Skill Cheatsheet

## Defaults

- Canvas base URL: `EXPRESS_SERVER_URL` (default `http://127.0.0.1:3000`); CLI also accepts `--url <canvasUrl>`
- Board vault: `ARCHBOARD_VAULT` (no default — board commands fail until it is set)
- Canvas health: `GET /health` or `archboard status`
- Auto-start: any canvas-touching CLI command starts the server if it's down (opt out with `EXCALIDRAW_NO_AUTOSTART=1`)

## CLI Reference

`archboard <command>` (or `./bin/canvas <command>` inside the archboard checkout).
JSON results on stdout — except `describe` (plain text) and raw-content output when `--out` is omitted (`export` scene JSON, `screenshot --format svg`). Diagnostics on stderr. Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required, 5 board write refused. Explicit `start` overrides `EXCALIDRAW_NO_AUTOSTART=1`.

**`--board <key>` is global and required on every command that touches a board** — `add`, `apply`, `get`, `query`, `update`, `delete`, `describe`, `export`, `import`, `mermaid`, `share`, `clear`, `snapshot`, `promote`, `demote`, `changes`, `arrange`, `library insert`, `board save`, `board info`. There is no default board and no fallback: a pane holds its own board, two panes hold two, so a call that names none is refused with the open boards listed (ADR 0009). Commands about the browser rather than a board — `panes`, `pane close`, `selection`, `screenshot`, `viewport`, `status`, `board list`, `library list`, `compare` — take no board. `pane open` takes an optional `--board`: the board to put in the new pane.

### Server

| Command | Description |
|---------|-------------|
| `start` | Start the canvas server (detached); prints URL + pid |
| `stop` | Stop the canvas server (identity-checked via `/health` — never signals foreign services) |
| `status` | Health, element count, connected browser tabs |

### Elements

| Command | Description |
|---------|-------------|
| `add [file\|-]` | Batch create from a JSON array (file, `-`, or piped stdin); `--one '{...}'` for a single element |
| `apply [file\|-]` | Multi-op patch `{"create":[...],"update":[{"id":"a","set":{...}}],"delete":["id",...]}` in one call |
| `get <id>` | Get one element |
| `query` | `--type rectangle` `--bbox x0,y0,x1,y1` `--filter locked=true` (typed; nested keys like `label.text=API` work) `--filter-json '{...}'` |
| `update <id> --set '{...}'` | Update one element |
| `delete <id> [...]` | Delete elements |

### Scene

| Command | Description |
|---------|-------------|
| `describe` | AI-readable scene summary (ids, positions, labels, connections) — plain text |
| `screenshot` | PNG/SVG capture of one pane; `--out f.png`, `--format png\|svg`, `--no-background`, `--pane <spec>`; PNG without `--out` → temp file path in JSON, SVG without `--out` → raw SVG. With two panes open, name the one you drew in or you photograph the other (**browser tab required**) |
| `export [--out f.excalidraw] [--format json\|obsidian]` | Scene as .excalidraw JSON (stdout without `--out`); a `.md` out path writes Obsidian's .excalidraw.md format |
| `import [file\|-] [--replace]` | Import .excalidraw JSON or Obsidian .excalidraw.md (merge by default) |
| `mermaid [file\|-]` | Render Mermaid onto the canvas (**browser tab required**) |
| `share` | Encrypted upload → shareable excalidraw.com URL |
| `clear --yes` | Wipe the canvas |
| `snapshot save\|list\|restore [name] [--force]` | Named canvas snapshots; a snapshot belongs to the board it was taken on, and `--force` restores it onto a different one |
| `changes [--since <cursor>] [--coalesce] [--detail] [--text]` | What the board became since a cursor, in `compare`'s vocabulary. One drag is one event; a nudge or a recolour is none. `--coalesce` gives one net diff since the cursor, which is what a once-per-turn read wants. Cursors belong to a canvas process, so watch `feedId`. No MCP equivalent |
| `board list` | Boards in the vault, boards open in this session, and which board each pane is showing |
| `board info --board <key>` | Identity and save state of one board |
| `board new <name> [--variant v] [--level l] [--pane <spec>]` | Empty board; in memory until saved |
| `board open <name[@variant]> [--reload] [--pane <spec>]` | Show a board in a pane. `--pane` takes `left`, `right`, `top`, `bottom`, a 1-based position, `primary`, or a pane id — required when more than one pane is open, since which half of the screen is not something to guess |
| `board save --board <key> [--as <name>] [--variant v] [--level l] [--force]` | Write it to the vault; **refused (exit 5) if the note changed on disk** — `--force` overwrites anyway. `--variant v` is how a board is **branched** into a proposal: it writes `<key>@v` and carries the level across. `--as` branches the same way, level included. **A branch moves nothing on screen** (ADR 0012): the panes holding the source keep holding it, and the branch is not showing until `pane open --board <key>@v` or `board open`. The answer says which — `saveKind`, `savedFrom`, `panes.moved`, `panes.kept`. Naming the scratch board is the one save that does move a pane |
| `compare <from> [to]` | Semantic diff between two variants, joined on node identity; opens nothing and leaves the canvas alone. One address finds the other variant itself |

### Panes and camera

A pane is a slot holding one board, and two panes are how the architecture that exists sits beside a proposal. All four of these need a browser tab and exit 4 without one: a pane exists only while a tab renders it.

| Command | Description |
|---------|-------------|
| `panes [--text]` | Read-only: which pane holds which board, where it sits, how much is in view, what is picked there |
| `pane open [--board <key>]` | Make a **new** pane and open that board into it — the whole side-by-side move in one command. It cannot be aimed at an existing pane, so it cannot overwrite the board somebody is reading. Without `--board` the new pane shows whatever was already on screen. Two panes is the limit |
| `pane close <spec>` | Close one pane. `spec` is `left`, `right`, `top`, `bottom`, a 1-based position, `primary`, `focused`, or a pane id, and is **always required** — which board comes off the screen is not something to guess. The board is untouched and stays open on the canvas; the last pane cannot be closed |
| `viewport --fit \| --ids a,b,c \| --element <id> \| --zoom n` | Point one pane's camera; exactly one of the four. `--fit` frames the whole board, `--ids` frames those elements, `--element` centres on one without changing zoom, `--zoom` with `--offset-x`/`--offset-y` sets it by hand. `--zoom-factor f` is the padding on a fit, so it needs `--fit` or `--ids`. `--pane <spec>` says which half moves |

### Stencil Library

| Command | Description |
|---------|-------------|
| `library list [--text]` | The palette of ready-made shapes: name, source library, size, element count, and the words drawn inside each — enough to choose one without rendering it |
| `library insert <name> --x <x> --y <y> [--source <lib>] [--id <itemId>]` | Copy a stencil onto the canvas with its top-left at `--x,--y`, as ordinary elements. A name several libraries use exits 2 with the candidates named |

### Arrange

| Command | Description |
|---------|-------------|
| `arrange align --ids a,b,c --to left\|center\|right\|top\|middle\|bottom` | Align (≥2 ids) |
| `arrange distribute --ids a,b,c --to horizontal\|vertical` | Even spacing (≥3 ids) |
| `arrange group --ids a,b` / `arrange ungroup --group <groupId>` | Group membership lives on element `groupIds` |
| `arrange lock\|unlock --ids a,b` | Toggle edit lock |
| `arrange duplicate --ids a,b [--offset 20,20]` | Clone with offset |

### Meta

| Command | Description |
|---------|-------------|
| `install-skill --dir <skills-root>` | Install this skill into an agent-chosen project/global skills root (replaces any existing copy) |
| `help [command]`, `--version` | Usage and version |

## MCP Tools

The MCP surface for clients that cannot run the CLI. `scripts/check-surface-parity.mjs` in the archboard repo fails if a tool is missing from this table.

### Element CRUD

| Tool | Description | Required params |
|------|-------------|-----------------|
| `create_element` | Create shape/text/arrow/line | `board`, `type`, `x`, `y` |
| `get_element` | Get single element by ID | `board`, `id` |
| `update_element` | Update element properties | `board`, `id` |
| `delete_element` | Delete element | `board`, `id` |
| `query_elements` | Query by type/filters | `board`, (optional) `type`, `filter`, `bbox` |
| `batch_create_elements` | Create many at once | `board`, `elements[]` |
| `duplicate_elements` | Clone with offset | `elementIds[]`, (optional) `offsetX`, `offsetY` |

### Layout & Organization

| Tool | Description | Required params |
|------|-------------|-----------------|
| `align_elements` | Align to left/center/right/top/middle/bottom | `board`, `elementIds[]`, `alignment` |
| `distribute_elements` | Even spacing horizontal/vertical | `board`, `elementIds[]`, `direction` |
| `group_elements` | Group elements | `board`, `elementIds[]` |
| `ungroup_elements` | Ungroup | `board`, `groupId` |
| `lock_elements` | Lock elements | `board`, `elementIds[]` |
| `unlock_elements` | Unlock elements | `board`, `elementIds[]` |

### Scene Awareness (Iterative Refinement)

| Tool | Description | Required params |
|------|-------------|-----------------|
| `describe_scene` | AI-readable scene description (types, positions, labels, connections, bounding box) | `board` |
| `get_canvas_screenshot` | Returns a PNG of one pane for visual verification; name the `pane` once two are open, or you photograph the first while your board sits in the second | (optional) `background`, `pane` |
| `get_resource` | Get scene/library/theme/elements | `resource`, plus `board` for `scene` and `elements` |
| `get_selection` | What the human has selected — the elements they mean by "this" / "these", with node kind and binding | (none) |
| `get_panes` | What the human is looking at, pane by pane: position on screen, board + variant, how much is in view, what is picked there. View state only | (none) |

### Nodes

| Tool | Description | Required params |
|------|-------------|-----------------|
| `promote_selection` | Declare the selection an architecture node: kind, identity and binding in one act. `each: true` makes one node per selected shape | `board`, `kind` |
| `demote_selection` | Strip archboard metadata back off; touching one element demotes the whole node | `board` |

### File I/O & Export

| Tool | Description | Required params |
|------|-------------|-----------------|
| `export_scene` | Export to .excalidraw JSON (a `.md` filePath → Obsidian .excalidraw.md) | `board`, (optional) `filePath` |
| `import_scene` | Import from .excalidraw JSON or Obsidian .excalidraw.md | `board`, `mode` ("replace"\|"merge"), `filePath` or `data` |
| `export_to_image` | Export one pane to PNG/SVG, whatever board that pane holds | `format` ("png"\|"svg"), (optional) `filePath`, `background`, `pane` |
| `export_to_excalidraw_url` | Upload & get shareable excalidraw.com URL | `board` |

### State Management

| Tool | Description | Required params |
|------|-------------|-----------------|
| `clear_canvas` | Remove all elements from one board | `board` |
| `snapshot_scene` | Save named snapshot | `board`, `name` |
| `restore_snapshot` | Restore from snapshot onto a board | `board`, `name` |

### Boards

Requires `ARCHBOARD_VAULT`. A pane holds exactly one board; two panes hold two. **`board` is a required parameter on every tool that touches one** — there is no default (ADR 0009).

| Tool | Description | Required params |
|------|-------------|-----------------|
| `list_boards` | Vault boards, open boards, and what each pane is showing | (none) |
| `open_board` | Show a board in a pane; `pane` (`left`, `right`, `1`…) is required when more than one is open | `board` (`name` or `name@variant`) |
| `new_board` | Start an empty board and show it in a pane | `board` |
| `save_board` | Write a board to the vault; **refused if the note changed on disk** (`force` overwrites anyway). `variant` branches the board into a proposal, which is what makes it comparable; a branch moves no pane, so `open_pane` it | `board` |
| `compare_boards` | Semantic diff between two variants, joined on node identity (`customData.archboard.node`). Complete and unsummarised — narrate it yourself. Reads a board from memory when it is open, else from its note; the canvas is untouched. Check `summary.comparable` and `layout.cannotExpress` before making claims | `from` (`to` optional) |

### Panes

A pane is a slot holding one board. Two panes are how the architecture that exists sits beside a proposal, and both of these need the canvas open in a browser.

| Tool | Description | Required params |
|------|-------------|-----------------|
| `open_pane` | Split the canvas and open a board into the **new** pane, leaving the existing one alone. Cannot target an existing pane, so it cannot overwrite what is on screen. Two panes is the maximum | (optional) `board` |
| `close_pane` | Close one pane; its board is untouched and stays open on the canvas. The last pane cannot be closed | `pane` (`left`, `right`, `1`…) |

### Stencil Library

| Tool | Description | Required params |
|------|-------------|-----------------|
| `list_library_items` | The palette of ready-made shapes, one line each: name, source library, size, element count, and the words drawn inside — enough to pick one without rendering it | (none) |
| `insert_library_item` | Copy a stencil onto a board with its top-left at `x`, `y`, as ordinary elements. A name several libraries use is refused with the candidates named — retry with `source` or `itemId` | `board`, `x`, `y`, and `name` or `itemId` |

### Viewport & Camera

| Tool | Description | Required params |
|------|-------------|-----------------|
| `set_viewport` | Control one pane's camera: zoom-to-fit all/selected elements, center one element without changing zoom, or manual zoom/scroll (needs browser); specify one mode per request. `pane` picks which half moves when two are open | (optional) `scrollToContent`, `scrollToElementIds`, `viewportZoomFactor` (0, 1], `scrollToElementId`, `zoom`, `offsetX`, `offsetY`, `pane` |

### Design Guide

| Tool | Description | Required params |
|------|-------------|-----------------|
| `read_diagram_guide` | Get design best practices (colors, sizing, layout, anti-patterns) | (none) |

### Conversion

| Tool | Description | Required params |
|------|-------------|-----------------|
| `create_from_mermaid` | Mermaid diagram to Excalidraw. Converts in the pane that answers for the browser, so `board` has to be the board that pane holds — refused otherwise | `board`, `mermaidDiagram` |

Notes:
- **CLI + MCP**: Set `text` on shapes to label them (auto-converts to `label.text`). Use `startElementId`/`endElementId` on arrows.
- **CLI `apply.update`**: Update entries can use either direct fields (`{"id":"a","x":120}`) or a `set` object (`{"id":"a","set":{"x":120}}`). Do not mix both forms in one update entry.
- **Raw REST**: Use `"label": {"text": "..."}` for shape labels. Use `"start": {"id": "..."}` / `"end": {"id": "..."}` for arrow binding. (Different format!)
- `fontFamily` must be a string (e.g. `"1"`, `"helvetica"`) or omitted — do NOT pass a number.
- `points` accepts both `[[x,y]]` tuples and `[{x,y}]` objects.
- **Curved arrows**: Use `"roundness": {"type": 2}` with 3+ points for smooth curves. Use `"elbowed": true` for right-angle routing.
- Prefer creating shapes first, then arrows, then alignment/grouping.

## Canvas REST API (HTTP)

### Elements

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/elements` | List all elements |
| `GET` | `/api/elements/:id` | Get element by ID |
| `POST` | `/api/elements` | Create element |
| `PUT` | `/api/elements/:id` | Update element |
| `DELETE` | `/api/elements/:id` | Delete element |
| `DELETE` | `/api/elements/clear` | Clear all elements |
| `GET` | `/api/elements/search?type=...` | Search with filters (exact string match + bbox) |
| `POST` | `/api/elements/batch` | Batch create |
| `POST` | `/api/elements/changes` | Browser change report: {upserts, deletes} merged into the board |
| `POST` | `/api/elements/from-mermaid` | Mermaid conversion via frontend |

### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/export/image` | Request image export (needs frontend) |
| `POST` | `/api/export/image/result` | Frontend posts export result back |

### Viewport

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/viewport` | Set viewport/camera; body may include `scrollToContent`, `scrollToElementIds`, `viewportZoomFactor`, `scrollToElementId`, `zoom`, `offsetX`, `offsetY` (needs frontend) |
| `POST` | `/api/viewport/result` | Frontend posts viewport result back |

### Boards

Every element endpoint **requires** `?board=<key>`; without it the answer is 400 with `code: "BOARD_REQUIRED"` and the open boards under `open`. There is no active board (ADR 0009).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/boards` | Vault listing + open boards + what each pane is showing |
| `GET` | `/api/boards/info?board=` | Identity and save state of one board |
| `POST` | `/api/boards/open` | `{board, variant?, level?, reload?, pane?}` — shows it in one pane, and answers with which |
| `POST` | `/api/boards/new` | `{board, variant?, level?, pane?}` — empty, unsaved |
| `POST` | `/api/boards/save` | `?board=` plus `{name?, variant?, level?, force?}` — writes the note; **409 + `conflict` if it changed on disk** |
| `GET` | `/api/boards/compare?from=&to=` | Semantic diff between two boards; read-only, never opens or switches a board. `to` optional when the board has exactly one other variant |

### Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/snapshots` | Save snapshot `{name}` |
| `GET` | `/api/snapshots` | List snapshots |
| `GET` | `/api/snapshots/:name` | Get snapshot by name |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (`websocket_clients` = open browser tabs) |
| `GET` | `/api/sync/status` | Memory/WebSocket stats |

## Design Guide (quick version)

Stroke/fill pairs: `#e03131`/`#ffc9c9` red, `#2f9e44`/`#b2f2bb` green, `#1971c2`/`#a5d8ff` blue, `#9c36b5`/`#eebefa` purple, `#e8590c`/`#ffd8a8` orange, `#0c8599`/`#99e9f2` cyan, `#868e96`/`#e9ecef` gray.
Styling: `"fillStyle": "solid"` for crisp flat fills (default is sketchy hachure); `"strokeStyle": "dashed"` for zone borders / async arrows.
Fills: a rectangle/ellipse/diamond created without a `backgroundColor` gets a neutral white solid fill, because a transparent shape is only selectable on its stroke. Say `"backgroundColor": "transparent"` to opt out. `promote` repaints an uncoloured node in its kind's pastel.
Sizing: shapes ≥ 120×60 with width ≥ `labelChars * 12`, fonts ≥ 16 (titles ≥ 20), gaps 40–80px (120px+ for labeled arrows), align to a 20px grid.
Order of work: background zones → primary shapes (with `text`) → arrows (bound via ids) → annotations → refine (align/distribute/screenshot).
MCP mode has the full guide behind the `read_diagram_guide` tool.
