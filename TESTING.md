# Running archboard end to end

How to get from a fresh checkout to Codex driving a board by voice. Written to
be followed, not skimmed.

## 1. Install

```bash
cd /home/msc/Projects/whiteboard
bun install                 # retry if it fails extracting a tarball
bunx vite build             # the frontend, the only thing that is built
```

bun runs the server and the CLI straight from `src/`, so there is no compile
step for them (ADR 0014). bun has to be on PATH for anything here to work.

Restore skills if this is a fresh clone — `.agents/skills/` and
`.claude/skills/` are derived and untracked:

```bash
skills experimental_install
bun scripts/sync-skills.mjs
```

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
refuses to start and tells you how to get one (ADR 0015). Open
<http://127.0.0.1:3000>.

## 3. Wire archboard into Codex

Archboard runs as an MCP stdio server when invoked with no arguments. In
`~/.codex/config.toml`:

```toml
[mcp_servers.archboard]
command = "bun"
args = ["/home/msc/Projects/whiteboard/src/bin.ts"]
env = { ARCHBOARD_VAULT = "/path/to/vault" }
startup_timeout_sec = 20
```

The client spawns this, so `bun` has to resolve on the PATH the client inherits.
A launcher started from a desktop session often has a shorter PATH than your
shell does; if the server never comes up, put the absolute path from
`which bun` in `command`.

Codex supports **stdio and streamable-http only** — no SSE, no websocket — and
negotiates MCP `2025-06-18` by default.

The tool prefix a client shows (`archboard/*`) comes from the key you chose
above, not from the server's own name. Tool names themselves are flat.

## 4. Enable the realtime voice feature

GPT-Live is gated off by default in Codex — `Stage::UnderDevelopment`,
`default_enabled: false`. In `~/.codex/config.toml`:

```toml
[features]
realtime_conversation = true
```

The voice session attaches to an **existing** thread rather than creating one,
and every delegation becomes a turn in that same thread.

## 5. A first session

```bash
./bin/canvas board new payments --level service
```

**Every command that touches a board names it** — `--board payments` — and one
that does not is refused, with the open boards listed in the refusal. There is
no active board to fall back on, because a pane holds its own board and two
panes hold two (ADR 0009). The canvas boots holding `scratch`, which is a board
like any other and is named like one.

Ask the agent to read a codebase and draw its architecture. Then, on the board:

1. **Select a box by tapping its interior** and ask the agent what you have
   selected — this is `selection`, and it is how "map *this* to X" works.
2. **Promote it**: `./bin/canvas promote --kind service --name "Payments"
   --path src/payments/index.ts --doing "calling this the payments service"`.
   The binding resolves through git to repo, path, branch and commit. Every
   write says what it is doing and is refused without it, and the line shows up
   on the board as the write lands (TASK-095) — watch the top right of the pane
   while the agent works, which is the point of the whole thing.
3. **Save**: `./bin/canvas board save --board payments --doing "writing it down"`.
4. **Branch a variant**: `./bin/canvas board save --board payments --as payments@option-a
   --doing "branching a proposal"`,
   then rearrange it — move a box out of a cluster, cut an edge, add a node.
   The branch is written but not put on screen: whatever pane held `payments`
   still holds it, because branching is how you get something to compare
   against (ADR 0012). Open the branch where you want it, as in step 6.
5. **Compare**: ask the agent what changed between `payments` and
   `payments@option-a`.
6. **Put them side by side**: `./bin/canvas pane open --board payments@option-a`.
   That splits the canvas and opens the variant into the pane it made, leaving
   the one you were reading alone — no clicking, so an agent can do it mid
   sentence. **Split** in the chrome does the same thing by hand. Each pane
   holds its own board, keeps its own selection, and is saved against its own
   baseline; `./bin/canvas panes` says which is which,
   `./bin/canvas screenshot --pane right` pictures one of them, and
   `./bin/canvas pane close right` puts you back to one.
7. **Draw into the half you mean**: pipe a Mermaid diagram at the variant,
   `... | ./bin/canvas mermaid --board payments@option-a --doing "sketching the
   proposal from mermaid"`, and watch it appear
   on the right while the left keeps the current architecture. `mermaid` takes
   no `--pane` and never will: it names a board, a board is in at most one
   pane, so the pane is already decided (TASK-046). Aim it at a board no pane
   is holding and it converts nothing, and says which panes are up and how to
   put that board on one.

Step 5 is the one worth watching closely. The tool returns structure; the agent
narrates it. If the narration is wrong or thin, the question is usually whether
the *data* was sufficient, not whether the model phrased it badly.

## 6. Let the board push back (optional)

Everything above is pull: the agent learns about the board when it next asks.
With injection on, the canvas tells a live Codex thread as changes happen —
quietly, so nothing is interrupted.

**This is a separate capability from the canvas being up, and it stays that
way.** Anything that can reach the canvas could otherwise drive your coding
agent, so injection is off unless asked for, and refuses to arm at all when the
canvas is bound to anything but loopback (ADR 0005). On the thin-client path in
`FLIP_WHITEBOARD.md`, either tunnel the canvas over SSH or leave this off.

```bash
export ARCHBOARD_VAULT=/path/to/vault
ARCHBOARD_INJECT=1 ./bin/canvas start     # must be set before the server starts
./bin/canvas inject status                # armed? connected? which thread?
```

`inject status` answers the three questions that go wrong: whether it armed
(and if not, why), whether the app-server control socket is there — it exists
only while the daemon is running, which in practice means while a session is up
— and **which thread it would tell**. That last one is decided, not guessed:

1. `ARCHBOARD_INJECT_THREAD`, if you set it. Pins one thread; best for testing.
2. Otherwise the thread that most recently called an archboard MCP tool — the
   one actually working on this board. Needs no configuration.
3. Otherwise the most recently active thread seen since the canvas connected.
4. Otherwise, if exactly one thread is loaded, that one.
5. Otherwise **nothing is injected**, and `status` says so. Interrupting a
   thread that has nothing to do with the board is worse than silence.

Threads are announced to a client as they are created or resumed, so start the
canvas before the session — or pin the thread.

Then rearrange something on the board. One drag produces **one** message, after
the board settles, and only when the change means something: a node moved
between clusters, an edge cut, a box promoted. Colour changes and nudges too
small to matter are silent. What the agent gets is the same text you can read
yourself:

```bash
./bin/canvas changes --text                  # events since the start
./bin/canvas changes --since 4 --coalesce    # one net diff since cursor 4
./bin/canvas inject test --note "wiring check"   # a probe, no board change needed
```

The agent's own drawing is never injected back at it, and injected items skip
`UserPromptSubmit`, so archboard cannot trigger its own hook.

### Loud injection, for testing only

Quiet injection appends to the thread's history without starting a turn. The
loud channel (`turn/steer`) interrupts the running turn instead, which makes
the agent **speak, unprompted, over you**. It ships off:

```bash
ARCHBOARD_INJECT=1 ARCHBOARD_INJECT_LOUD=1 ./bin/canvas start
./bin/canvas inject test --loud     # one loud probe, without restarting
```

With loud on, a change interrupts only when a turn is actually running; with
nothing to interrupt it falls back to quiet.

### Knobs

| Variable | Default | What it does |
|---|---|---|
| `ARCHBOARD_INJECT` | unset (off) | Arms injection. Read at server start. |
| `ARCHBOARD_INJECT_LOUD` | unset (off) | Allows `turn/steer`. Experimental. |
| `ARCHBOARD_INJECT_THREAD` | unset | Pins the target thread. |
| `ARCHBOARD_MCP_SERVER_NAME` | `archboard` | The key you gave this MCP server in `config.toml`; how tool calls are recognised. |
| `ARCHBOARD_INJECT_DEBOUNCE_MS` | 4000 | Coalescing window for changes. |
| `ARCHBOARD_INJECT_MIN_INTERVAL_MS` | 10000 | Floor between injections. |
| `ARCHBOARD_SETTLE_MS` | 1200 | How long the board must be still before a change counts. |
| `CODEX_HOME` | `~/.codex` | Where the control socket is found. |

Those three defaults are set in `src/core/timing.ts`, alongside the pane's
report debounce and the change feed's settle window, because changing one of
them moves the others. The reasoning is in that file; the numbers here are a
copy for reading.

## What to expect, and what not to

**The voice model never sees tool results.** Verified in the Codex source:
`realtime_text_for_event` returns `None` for `McpToolCallBegin` and
`McpToolCallEnd`. Only the thread's own prose reaches the voice layer, prefixed
`[BACKEND] ` and capped at 1,000 tokens. So the agent reads the structured diff
and speaks about it; it is not reading the diff aloud.

**Saving refuses rather than resolving.** If a note changed on disk since
archboard read it — Obsidian had it open, or a sync client wrote it — the save
is refused with exit 5 and three options: reload, `--force`, or `--as`.
Archboard never picks for you. See ADR 0006.

**Prose in a board note survives.** Markdown you write above the
`# Excalidraw Data` heading is yours and is preserved across saves.

**A command without `--board` fails, and that is the design.** There is no
active board and no default: two panes hold two boards, so "the board" would be
a guess, and a guess that is right most of the time is the kind of mistake that
takes longest to find. The refusal lists the boards that are open (ADR 0009).

**Push is off by default, not absent.** The canvas can tell a live thread that
the board changed, quietly, as it happens — see section 6. It stays off until
asked for, and refuses to arm when the canvas is not on loopback.

## If something looks broken

Read the "Things that will mislead you" section of
`skills/archboard-dev/SKILL.md` first. It lists the traps that have already
cost time — including that an *unlabelled* transparent shape cannot be clicked
in its interior, and that with `ARCHBOARD_VAULT` unset the canvas will not
start at all, so what you meant to test never runs.
