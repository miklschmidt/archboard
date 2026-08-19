# Whiteboard — agent-driven architecture canvas

A fork of [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
(MIT), being tailored into a live canvas for building, exploring, and
refactoring **code and infrastructure architecture** by voice with an agent.

- Display setup (Samsung Flip WM75FX): `FLIP_WHITEBOARD.md`
- Fork rationale and roadmap: `FORK.md`

## Fork baseline

`main` is based on upstream `v2.0.0` (`6ddbe98`, 2026-08-09) with full upstream
history, so `git merge upstream/main` stays viable. Keep patches surgical and
upstreamable — upstream is actively releasing.

```bash
git fetch upstream && git log --oneline upstream/main   # check for new work
```

Upstream tags v2.0.0 in git but has **never published it to npm** (npm `latest`
is 1.1.0, from 2026-07-06). We build from source; do not `bun add
mcp-excalidraw-server`.

## Build and run

This box has node + bun but **no npm/npx**, so the `npm run *` scripts in
`package.json` do not work. Drive the tools directly:

```bash
bun install
bunx tsc            # build:server  -> dist/
bunx vite build     # build:frontend -> dist/frontend/

./bin/canvas start  # canvas server on 127.0.0.1:3000
./bin/canvas status
./bin/canvas stop
```

`bun install` intermittently fails extracting a tarball; just run it again.

`bin/canvas` wraps `dist/bin.js` and resolves from any cwd. Use it, never `npx`.

Open <http://127.0.0.1:3000>. A browser tab is required for `screenshot`,
`mermaid`, image export, and viewport control; pure JSON ops work headless.

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

- **`describe` ignores `customData` and `link`.** The agent's primary read path
  is blind to the semantic model. Fixing this is prerequisite to everything else.
- **No persistence.** In-memory; dies with the server.
- **No multi-document.** One global canvas — no current/proposed variants.
- **No change-event feed.** Agent must poll; wrong shape for full-duplex voice.
- `export --out` does not `mkdir -p`.
- Page title is still "Excalidraw POC - Backend API Integration".

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
