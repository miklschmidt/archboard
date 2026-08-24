# archboard — agent-driven architecture canvas

An internal tool: a live Excalidraw canvas for building, exploring, and
refactoring **code and infrastructure architecture** by voice with an agent.
Private, never published — to npm or anywhere else.

Where things are written down:

- Display setup (Samsung Flip WM75FX): `FLIP_WHITEBOARD.md`
- Design and roadmap: `DESIGN.md`
- Running it end to end with Codex: `TESTING.md`
- Installing it for use in other repos: `INSTALL.md`
- Domain language: `CONTEXT.md`
- Decisions: `docs/adr/` — read the ADR before touching what it decides
- Measured investigations (write costs, text metrics, hot reload,
  statelessness): `docs/design/`
- Using the canvas: the `archboard` skill. Working on this repo's own
  source: the `archboard-dev` skill — procedures, and a list of things that
  will mislead you
- Work, open and closed: Backlog.md via the `backlog` CLI; never hand-edit
  files under `backlog/`

## Upstream

`main` is based on [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
`v2.0.0` (`6ddbe98`, 2026-08-09) with full upstream history retained.
**Archboard is diverging deliberately and is not kept mergeable.** Restructure
freely; the `upstream` remote exists for reference and cherry-picking (see the
archboard-dev skill), not as a merge target. Always build from source; never
`bun add mcp-excalidraw-server` — the npm package is releases behind.

## Run it (there is no build step)

bun runs the TypeScript: the server and the CLI start from `src/`, and only
the frontend is built, by vite (ADR 0014). This box has node + bun but **no
npm/npx** — run scripts with `bun run`, never `npm run`. `bun install`
intermittently fails extracting a tarball; just run it again.

```bash
bun install
bun run build       # frontend only -> dist/frontend/
bun run test        # type-check first, then the whole suite
./bin/canvas start  # canvas server on 127.0.0.1:3000
./bin/canvas status # names stale source in a running server, and the remedy
./bin/canvas stop
```

`bin/canvas` runs `src/bin.ts` with bun and resolves from any cwd; use it,
never `npx`. **A canvas with no vault refuses to start** (ADR 0015) — set
`ARCHBOARD_VAULT` (or put it in `.env`) before the server starts.

**Editing source changes behaviour on the next CLI command, but not in a
server that is already running** — that needs a restart, or a reload:

```bash
bun run dev:canvas    # the canvas, reloadable (bun run dev adds vite on :5173)
bun run reload        # reloads it in place, keeping tabs, panes and the feed
```

Saving a file reloads nothing; the command is the trigger, and a canvas from
`canvas start` cannot reload at all. **State that must survive a reload lives
in `kept()`** (`src/core/hot.ts`), never in module scope, which a reload
rebuilds — `bun run test:module-scope` enforces it; waive a false positive
with `// hot-safe: <reason>`. Mechanics and costs:
`docs/design/hot-reload-under-bun.md` and the archboard-dev skill.

**Running the suite needs `agent-browser` on PATH**: three checks drive a real
browser and exit 2 without one. They must stay headless — a window that maps
steals focus under Hyprland — and run one after another, never at once. A push
runs `bun run test` and nothing else, and `test:suites` fails when a `test:*`
script is missing from that chain. Changing tests or CI, or a browser check
failing → `docs/agents/test-suite.md`: what each check proves, the
constraints, the timings.

Open <http://127.0.0.1:3000>. A browser tab is required for `screenshot`,
`mermaid`, image export, and viewport control; pure JSON ops work headless.

## Skills (after a fresh clone)

`.agents/skills/` and `.claude/skills/` are **derived and untracked**, so a
clone has no skills until you restore them:

```bash
skills experimental_install     # third-party, pinned in skills-lock.json
bun scripts/sync-skills.mjs     # ours, from skills/ (creates the symlinks)
```

`skills/` is our single tracked source, deliberately absent from
`skills-lock.json` so the skills tool cannot clobber it. Everything else under
`.claude/` — `settings.json`, `commands/`, `agents/` — is authored
configuration and **is** tracked.

## The loop

```
agent reads code  ->  draws the architecture  ->  you rearrange it on the Flip
      ^                                                      |
      +------------  agent reads the new layout  <-----------+
```

The read-back is the point. Moving a box is a statement about the design.

**Creators need an immediate connection to what they are creating** (Bret
Victor, *Inventing on Principle*). On this canvas the creator is both of you,
so every change either of you makes is visible as it is made. Keeping somebody
from *editing* while another writer holds the board is fine — that is what the
lock is for (ADR 0016). Keeping them from *seeing* is not. An agent never
works out of sight and reveals the result: it claims the board, says what it
is doing, and restructures in the open.

## Invariants

The loud rules teach themselves — a call that names no board is refused and
told what is open (ADR 0009), an agent write without `--doing` is refused
(TASK-095), a stale write is refused once with the board's real version
(`BOARD_VERSION_CONFLICT`: re-read the board, never retry blind), and a note
that changed on disk under another editor is refused, never overwritten
(ADR 0006). These are the rules nothing refuses:

- **The note is the board, and the canvas holds no copy of one** (ADR 0015).
  `src/core/board-io.ts` is the one place a note is read or written, and it is
  synchronous on purpose — an `await` between the read and the write would let
  two writes to one board interleave. Every note write goes through
  `src/core/atomic-write.ts`; the fsync is over half the cost of a write and
  was accepted with ADR 0015 — do not optimise it away without reopening it.
- **One writer at a time, per board** (ADR 0016). The lock is a lease file in
  the vault, taken by one write-boundary middleware, deny by default: a
  non-GET naming a board is a write unless the exemption table says why not.
  The same middleware requires `doing`. Claim before substantial work
  (`claim` / `release`) — nothing refuses you for skipping it; you just leave
  a gap for another writer between every pair of writes.
- **A person is never refused** — not by the lock beyond `REPORT_DEBOUNCE_MS`,
  not by the version check, and never asked to narrate. An agent must not make
  a 75-inch display stop responding to the person standing at it.
- **There is one converter, it runs on the way in, and nothing converts on the
  way out** (ADR 0015). `label: {text}` and arrow `start`/`end` are input
  spellings, spent at the write boundary; the board holds the result — a
  labelled box is two elements from the moment it is written — and Excalidraw
  does not change it (`test:browser` asserts a zero diff). A second converter,
  or a conversion on the read path, is how one board becomes two documents.
  The exception-looking thing is not an exception: binding-derived code links
  are a noncanonical presentation overlay, added to copies returned to a
  browser or caller and stripped at the write boundary. They are never a second
  board document and never persist in the note.
- **One thing somebody asked for is one write** (TASK-068). Align, patch,
  promote, import: each reaches the note as one read-modify-write under one
  lock acquisition, and `test:one-write` counts writes on the wire.
- **Renaming an element id is the most dangerous thing in the system.** Every
  id archboard mints comes from `src/core/ids.ts`: one to eight characters of
  Obsidian's block-id alphabet, so the note writer has nothing to rename. No
  second minting site, no longer shape. Why, and what a rename costs:
  `docs/design/server-is-the-truth.md` §4.
- **A text element's width is measured, not estimated**
  (`src/core/measure-text.ts`, within 0.0012 px of Chrome):
  `docs/design/measuring-text-outside-a-browser.md`.
- **Every write path replaces an element; nothing edits one in place.**
  Branches and snapshots are deep copies, and checks mutate copies to prove
  it (TASK-042, TASK-048).
- **Every duration is in `src/core/timing.ts`** with what it pulls against
  written beside it. Read the file before tuning one (TASK-066).
- **`customData.archboard` is archboard's metadata channel** (ADR 0003) and
  survives the human round-trip; archboard's own keys sit under
  `customData.archboard`, never flat. A code-bound element persists
  `customData.archboard.binding` only: repository, repo-relative path, and
  branch/commit/confirmed-at details when available. `link` is still valid for
  human-authored board and web links, but a code binding's tappable local target
  is derived on outbound presentation from the binding plus the machine-local
  checkout registry, and is stripped before any note write. Elements that came
  back through the browser are tagged `"source": "frontend_sync"`.
- **Keep a board open in one editor at a time.** The conflict check reads the
  file, not another app's memory, so two editors can still cross-write.
- **Injection is opt-in and loopback-only** (`ARCHBOARD_INJECT=1`, ADR 0005),
  and an agent's own drawing is never injected back at it. See TESTING.md §6.

## Names on the wire

`archboard` is the name everywhere a user reads: CLI help and errors, the MCP
`serverInfo.name`, the `source` in exported scenes. Two internal identity
strings deliberately keep the old spelling — `mcp-excalidraw-canvas` in
`/health` (how a client proves it is not talking to a foreign service on the
port) and the `excalidraw-canvas` state directory (renaming it would orphan a
running server's pidfile). Neither is printed by any command.

## Agent docs

- Issue tracker: Backlog.md, CLI only — `docs/agents/issue-tracker.md`
- Triage labels, the five canonical role strings — `docs/agents/triage-labels.md`
- Domain docs, `CONTEXT.md` and `docs/adr/`, created lazily — `docs/agents/domain.md`

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
