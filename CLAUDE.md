# archboard — agent-driven architecture canvas

An internal tool: a live Excalidraw canvas for building, exploring, and
refactoring **code and infrastructure architecture** by voice with an agent.
Private, never published.

- Display setup (Samsung Flip WM75FX): `FLIP_WHITEBOARD.md`
- Design and roadmap: `DESIGN.md`

## Relationship to upstream

`main` is based on [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
`v2.0.0` (`6ddbe98`, 2026-08-09) with full upstream history retained.

**Archboard is diverging deliberately and is not kept mergeable.** Restructure
freely — rename things, delete what we don't use, break upstream conventions
where ours are better. The `upstream` remote exists for reference and occasional
cherry-picking, not as a merge target. Early docs and commits optimised for
upstreamability; that constraint is gone.

Archboard is **private and never published to npm** (`"private": true`). Upstream
tags v2.0.0 in git but never published it either — npm `latest` is 1.1.0, from
2026-07-06, and two releases behind. Always build from source; never
`bun add mcp-excalidraw-server`.

## Build and run

This box has node + bun but **no npm/npx**. The `package.json` scripts now shell
out to bun, so run them with `bun run`, never `npm run`:

```bash
bun install
bun run build       # -> dist/ and dist/frontend/
bun run type-check
bun run test        # MCP stdio wire checks + loopback-bind check

./bin/canvas start  # canvas server on 127.0.0.1:3000
./bin/canvas status
./bin/canvas stop
```

Or drive the tools directly: `bunx tsc` (server), `bunx vite build` (frontend).

`bun install` intermittently fails extracting a tarball; just run it again.

`bin/canvas` wraps `dist/bin.js` and resolves from any cwd. Use it, never `npx`.

Open <http://127.0.0.1:3000>. A browser tab is required for `screenshot`,
`mermaid`, image export, and viewport control; pure JSON ops work headless.

## Skills (after a fresh clone)

`.agents/skills/` and `.claude/skills/` are **derived and untracked**, so a
clone has no skills until you restore them:

```bash
skills experimental_install     # 28 third-party skills, from skills-lock.json
node scripts/sync-skills.mjs    # ours, from skills/
```

The sync creates the `.claude/skills/` symlinks itself; no manual linking.

Everything else under `.claude/` — `settings.json`, `commands/`, `agents/` — is
authored configuration and **is** tracked.

`skills/` is our single tracked source: any subdirectory with a `SKILL.md` is a
skill, so adding one means adding a directory. Portability is a property of the
individual skill, not the location — `excalidraw-skill` is used outside this
repo so it stays path-free, while maintainer-facing skills like `archboard-dev`
may reference repo paths freely.

Our skills are deliberately absent from `skills-lock.json`, which pins only
third-party skills — that keeps the skills tool from clobbering ours.

`~/.claude/skills/excalidraw-skill` is a symlink to the synced copy, so the
canvas skill works in other repos and cannot drift.

## The loop

```
agent reads code  ->  draws the architecture  ->  you rearrange it on the Flip
      ^                                                      |
      +------------  agent reads the new layout  <-----------+
```

The read-back is the point. Moving a box is a statement about the design.

```bash
./bin/canvas describe                 # AI-readable scene text
./bin/canvas query --type rectangle   # structured, includes customData + link
./bin/canvas screenshot --out /tmp/c.png
```

## Verified behaviour (v2.0.0)

Established by testing this build, not by reading docs.

| Change | Reaches server state? |
|---|---|
| Agent `add` / `batch_create` | yes, immediately |
| Human drags / edits / hand-draws | yes, automatically |
| `./bin/canvas mermaid` | **yes** — fixed in v2 |

The one-way mermaid behaviour was a **1.1.0 bug**, fixed upstream by an explicit
`await syncToBackend()` after conversion. Do not design around it.

**`customData` and `link` both survive the full round-trip**, including the
frontend sync after a human drags an element. Verified with a real drag:
position changed, both fields intact. This is the metadata channel — no sidecar
file, no encoding paths into labels.

```json
{"type":"rectangle","x":100,"y":100,"width":300,"height":120,
 "label":{"text":"AuthService"},
 "link":"file:///abs/path/src/auth/service.ts",
 "customData":{"kind":"service","path":"src/auth/service.ts","variant":"current"}}
```

`link` renders as a clickable affordance on the shape — tap the box on the Flip,
open the file.

Elements synced from the browser are tagged `"source": "frontend_sync"`, which
distinguishes human edits from agent-authored elements.

## Known gaps (our work)

Tracked in Backlog.md; `backlog task list --plain` is authoritative.

- **No persistence.** In-memory; dies with the server. (TASK-003)
- **No multi-document.** One global canvas — the element store is keyed by
  element id with no board dimension at all, so "load board X" does not exist.
  (TASK-003)
- **No change-event feed.** Agent must poll; wrong shape for full-duplex voice.
- **A node with a transparent background is only selectable by its stroke**, so
  tapping the middle of a hollow box picks nothing. (TASK-009)
- `export --out` does not `mkdir -p`.
- Page title is still "Excalidraw POC - Backend API Integration".

Closed: `describe` surfaces `customData` and `link`, separates nodes from plain
elements, and folds bound labels and multi-element nodes (TASK-001). Obsidian
export preserves custom frontmatter, so board identity survives (TASK-002).
Selection reaches the server and is readable via `selection` / `get_selection`
(TASK-004). Promotion declares a selection to be a node with a git-resolved
binding (TASK-005). The CLI and MCP handshake identify as `archboard`
(TASK-008).

## Names on the wire

`archboard` is the CLI's own name in help and errors, the MCP `serverInfo.name`
in the `initialize` handshake, and the `source` stamped into exported
`.excalidraw` scenes. No MCP client config needs to change: tool names are flat
(`create_element`, …) and never namespaced by the server name — a client's
`mcpServers` key, which is what prefixes tools in a client UI, is chosen in the
config, not derived from `serverInfo.name`.

Two internal identity strings deliberately keep the old spelling, because they
are handshakes between our own processes rather than anything a user reads:
`mcp-excalidraw-canvas` in `/health` (`CANVAS_SERVICE_NAME`, how the client
proves it is not talking to a foreign service on the port) and the
`excalidraw-canvas` state directory holding the pidfile (renaming it would
orphan a running server's pidfile). Neither is printed by any command.

## Artifacts

```bash
mkdir -p diagrams
./bin/canvas export --out diagrams/arch.excalidraw
./bin/canvas import diagrams/arch.excalidraw   # merges by default
./bin/canvas snapshot save before-split
```

Commit diagrams alongside the code change so architecture decisions are
reviewable in the diff.

## Agent skills

### Issue tracker

Issues and planning live in Backlog.md under `backlog/`, driven through the
`backlog` CLI — never edit those files by hand. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical role strings, used verbatim (Backlog.md labels are
free-form, so no mapping is needed). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, both created
lazily. See `docs/agents/domain.md`.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
