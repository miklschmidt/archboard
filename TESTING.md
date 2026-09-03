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
that does not is refused, with persisted board choices in the refusal. There is
no active board or browser-session fallback (ADR 0020). The canvas boots holding
`scratch`, which is a board like any other and is named like one.

Ask the agent to read a codebase and draw its architecture. Then, on the board:

1. **Select a box by tapping its interior** and ask the agent what you have
   selected. `browser selection --pane <spec>` returns the stable ids for
   "map _this_ to X".
2. **Promote it**: `./bin/canvas promote --ids <selected-id> --kind service
--name "Payments" --path src/payments/index.ts --doing "calling this the payments service"`.
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
6. **Put them side by side**: `./bin/canvas browser open`, then
   `./bin/canvas browser show payments@option-a --pane right`.
   That splits the canvas and opens the variant into the pane it made, leaving
   the one you were reading alone — no clicking, so an agent can do it mid
   sentence. **Split** in the chrome does the same thing by hand. Each pane
   holds its own board, keeps its own selection, and is saved against its own
   baseline; `./bin/canvas browser panes` says which is which,
   `./bin/canvas browser capture --pane right` pictures one of them, and
   `./bin/canvas browser close right` puts you back to one.
7. **Draw into the half you mean**: pipe a Mermaid diagram at the variant,
   `... | ./bin/canvas mermaid --board payments@option-a --doing "sketching the
proposal from mermaid"`, and watch it appear
   on the right while the left keeps the current architecture. `mermaid` takes
   no `--pane` and never will: it names a board, while a browser pane is a
   pane, so the pane is already decided (TASK-046). Aim it at a board no pane
   is holding and it converts nothing, and says which panes are up and how to
   put that board on one.

Step 5 is the one worth watching closely. The tool returns structure; the agent
narrates it. If the narration is wrong or thin, the question is usually whether
the _data_ was sufficient, not whether the model phrased it badly.

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
takes longest to find. The refusal lists the boards that are open (ADR 0009).

## If something looks broken

Read the "Things that will mislead you" section of
`skills/archboard-dev/SKILL.md` first. It lists the traps that have already
cost time — including that an _unlabelled_ transparent shape cannot be clicked
in its interior, and that with `ARCHBOARD_VAULT` unset the canvas will not
start at all, so what you meant to test never runs.
