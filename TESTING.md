# Running archboard end to end

How to get from a fresh checkout to Codex driving a board by voice. Written to
be followed, not skimmed.

## 1. Build

```bash
cd /home/msc/Projects/whiteboard
bun install                 # retry if it fails extracting a tarball
bunx tsc && bunx vite build
```

Restore skills if this is a fresh clone — `.agents/skills/` and
`.claude/skills/` are derived and untracked:

```bash
skills experimental_install
node scripts/sync-skills.mjs
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
exporting it afterwards changes nothing. Open <http://127.0.0.1:3000>.

## 3. Wire archboard into Codex

Archboard runs as an MCP stdio server when invoked with no arguments. In
`~/.codex/config.toml`:

```toml
[mcp_servers.archboard]
command = "node"
args = ["/home/msc/Projects/whiteboard/dist/bin.js"]
env = { ARCHBOARD_VAULT = "/path/to/vault" }
startup_timeout_sec = 20
```

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

Ask the agent to read a codebase and draw its architecture. Then, on the board:

1. **Select a box by tapping its interior** and ask the agent what you have
   selected — this is `selection`, and it is how "map *this* to X" works.
2. **Promote it**: `./bin/canvas promote --kind service --name "Payments" --path src/payments/index.ts`.
   The binding resolves through git to repo, path, branch and commit.
3. **Save**: `./bin/canvas board save`.
4. **Branch a variant**: `./bin/canvas board save --as payments@option-a`, then
   rearrange it — move a box out of a cluster, cut an edge, add a node.
5. **Compare**: ask the agent what changed between `payments` and
   `payments@option-a`.

Step 5 is the one worth watching closely. The tool returns structure; the agent
narrates it. If the narration is wrong or thin, the question is usually whether
the *data* was sufficient, not whether the model phrased it badly.

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

**Not wired yet.** The canvas cannot push to a live thread — the agent learns
about board changes when it next asks. Change events and app-server injection
are TASK-018 and TASK-019; quiet injection will be the default, and loud
(`turn/steer`, which makes the agent speak unprompted) will ship off and
switchable for exactly this kind of testing.

## If something looks broken

Read the "Things that will mislead you" section of
`skills/archboard-dev/SKILL.md` first. It lists the traps that have already
cost time — including that an *unlabelled* transparent shape cannot be clicked
in its interior, and that board commands fail on the vault message rather than
on whatever you were actually testing when `ARCHBOARD_VAULT` is unset.
