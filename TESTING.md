# Running archboard end to end

How to get from a fresh checkout to Codex driving a board by voice. Written to
be followed, not skimmed.

## 1. Install

```bash
cd /path/to/archboard
bun install                 # retry if it fails extracting a tarball
bun run build               # the frontend, the only thing that is built
```

bun runs the server and the CLI straight from `src/`, so there is no compile
step for them (ADR 0014). bun has to be on PATH for anything here to work.

Restore skills if this is a fresh clone — `.agents/skills/` and
`.claude/skills/` are derived and untracked:

```bash
skills experimental_install
bun scripts/sync-skills.ts
```

Edit only `skills/`. Re-running the sync must reproduce both derived copies;
do not commit them or any PNG, SVG, manifest, or exported scene made as proof.

## 2. Pick a vault

Boards are `.excalidraw.md` notes in an Obsidian vault that spans repositories.
There is deliberately no default, because defaulting to the working directory
would silently create a different vault per checkout.

```bash
export ARCHBOARD_VAULT=/path/to/vault
./bin/canvas start
```

**Set it before starting the server** — the server does the vault I/O, so
exporting it afterwards changes nothing, and with no vault at all the canvas
refuses to start and tells you how to get one (ADR 0015). The browser at
<http://127.0.0.1:3000> is optional and belongs only to a live human session.

## 3. Make the CLI available to Codex

Put the source-built binary on `PATH`, then install the tracked skill into the
repository Codex will work on:

```bash
ln -s /path/to/archboard/bin/canvas ~/.local/bin/archboard
cd /path/to/project
archboard install-skill --vault /path/to/vault
```

Running `archboard` with no command shows CLI help. Canvas-driving commands
auto-start the Express and WebSocket server; they do not start another agent
transport.

## 4. Use the Archboard-owned Codex session

Starting the canvas also starts one exact package-local Codex app-server child
over stdio. Archboard owns the child's dedicated `CODEX_HOME`,
`CODEX_SQLITE_HOME`, strict `config.toml`, epoch manifests, app-server state,
and sign-in. On Linux they live below
`$XDG_STATE_HOME/excalidraw-canvas/codex-workbench`, or below
`~/.local/state/excalidraw-canvas/codex-workbench` when `XDG_STATE_HOME` is
unset. Do not edit user-global Codex configuration to enable this integration.
The coordinator's authored thread profile enables realtime for that thread.

A pane links to one workhorse. Voice attaches to a separate persistent
coordinator for that link, never directly to the workhorse. The coordinator can
answer quick questions and hand sustained work to the workhorse without mixing
their histories.

## 5. A first session

Start with the explicit persisted board. This complete workflow needs no
browser connection:

```bash
./bin/canvas board new payments --level service
./bin/canvas add --board payments --doing "drawing the payment path" elements.json
printf 'graph LR; Gateway --> Orders; Orders --> Store' | \
  ./bin/canvas mermaid --board payments --doing "adding the service flow"
./bin/canvas render --board payments --out payments.png
./bin/canvas render --board payments --out payments.svg --format svg
./bin/canvas check --board payments --strict
./bin/canvas describe --board payments
./bin/canvas snapshot save v1 --board payments
./bin/canvas board save --board payments --variant option-a \
  --doing "branching the proposal"
./bin/canvas export --board payments@option-a --out payments-option-a.excalidraw
```

**Every command that touches a board names it** — `--board payments` — and one
that does not is refused, with persisted board choices in the refusal. There is
no active board or browser-session fallback (ADR 0020). The canvas boots holding
`scratch`, which is a board like any other and is named like one.

`render` produces PNG or SVG from one immutable named-board snapshot in the
server-owned renderer. Mermaid conversion uses that same server boundary and
commits one board write. If `check` reports a real finding with a focus box,
create an empty output directory and run `render-findings --board payments
--out <directory>`. Do not make finding renders when there is no finding.

Read the final note directly at
`$ARCHBOARD_VAULT/payments.excalidraw.md`. No open, load, show, pane, selection,
camera, or capture step establishes the board.

### Live browser collaboration

Enter this branch only when a person is using the canvas or the requested
evidence concerns the live session:

```bash
./bin/canvas browser panes --text
./bin/canvas browser selection --pane primary --text
./bin/canvas browser open
./bin/canvas browser show payments@option-a --pane right
./bin/canvas browser viewport --pane right --fit
./bin/canvas browser capture --pane right --out option-a-live.png
```

Each command names its live target. None writes the board note. Pass selected
ids explicitly to a later named-board write. A pane already showing the board
receives committed writes, but its delivery or acknowledgement does not decide
whether the write succeeds.

## 6. Verify Codex semantic delivery

The controlled module owners cover the
[bound app-server contract](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session):

```bash
bun test src/runtime/codex-semantic-context/tests \
  src/runtime/codex-thread-context/tests
```

The real composition owner starts the Canvas application and its owned child,
links a workhorse, sends one human change through `thread/inject_items`, proves
an agent-only change stays silent, and verifies the retired HTTP routes behave
like ordinary unknown routes:

```bash
bun test tests/system/canvas-state/codex-workbench-production.test.ts
```

## What to expect, and what not to

**The voice model never sees command output automatically.** The Codex thread
runs the CLI, reads the structured diff, and narrates it. Only the thread's own
prose reaches the voice layer, prefixed `[BACKEND] ` and capped at 1,000 tokens.

**Saving refuses rather than resolving.** If a note changed on disk since
archboard read it — Obsidian had it open, or a sync client wrote it — the save
is refused with exit 5 and three options: reload, `--force`, or `--as`.
Archboard never picks for you. See ADR 0006.

**Prose in a board note survives.** Markdown you write above the
`# Excalidraw Data` heading is yours and is preserved across saves.

**A command without `--board` fails, and that is the design.** There is no
active board and no default: two panes hold two boards, so "the board" would be
a guess, and a guess that is right most of the time is the kind of mistake that
takes longest to find. The refusal lists persisted boards from the configured
vault (ADR 0020).

## If something looks broken

Read the "Things that will mislead you" section of
`skills/archboard-dev/SKILL.md` first. It lists the traps that have already
cost time — including that an _unlabelled_ transparent shape cannot be clicked
in its interior, and that with `ARCHBOARD_VAULT` unset the canvas will not
start at all, so what you meant to test never runs.
