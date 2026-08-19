# Using archboard in another repository

Archboard is not a dependency of the repositories you diagram. Nothing gets
added to them, nothing gets committed to them, and they never build it. You
install archboard once on a machine and point it at whatever repo you happen to
be working in.

If you are setting up the voice loop rather than the tool, read
[`TESTING.md`](TESTING.md) instead. This is the shorter, per-machine story.

## What actually has to be true

Four things, and only the first two involve installing anything.

1. The archboard build exists somewhere on this machine.
2. An agent can find the CLI.
3. `ARCHBOARD_VAULT` points at a vault, before the canvas server starts.
4. The agent knows a skill exists that teaches it how to draw.

## 1. Build it once

```bash
git clone <your fork> ~/Projects/archboard
cd ~/Projects/archboard
bun install                 # retry if it fails extracting a tarball
bunx tsc && bunx vite build
```

The package is private and never published, so there is nothing to install from
npm. Build from source, and rebuild after pulling.

## 2. Put the CLI where an agent will find it

Out of the box the only entry point is `./bin/canvas` inside the checkout,
which is useless from another repo. Give it a name on your PATH:

```bash
ln -s ~/Projects/archboard/bin/canvas ~/.local/bin/archboard
```

`bin/canvas` resolves its own location, so the symlink works from any working
directory and always runs the current build. Every example in the skill says
`archboard`, so this is the name to use.

## 3. Choose a vault

Boards live in an Obsidian vault, as `.excalidraw.md` notes. The vault spans
every repository you work in, which is the point: a system diagram whose boxes
belong to five repos has nowhere else to live.

```bash
export ARCHBOARD_VAULT=~/vaults/architecture
```

Put that in your shell profile. There is deliberately no default, because
defaulting to the working directory would silently give you a different vault
per checkout.

The server does the vault I/O, so **set it before starting the canvas server**.
Exporting it afterwards changes nothing, and board commands will fail on the
vault message rather than on whatever you were doing.

## 4. Install the skill

The skill is what teaches an agent the commands. Without it an agent has a
binary it does not know how to use.

```bash
archboard install-skill --target claude    # ~/.claude/skills
archboard install-skill --target codex     # Codex skills root
```

Install it once at the user level and it applies in every repo. On the machine
this was developed on, `~/.claude/skills/excalidraw-skill` is a symlink into the
checkout instead, so the skill tracks the build and cannot go stale. That is
worth copying if you are also working on archboard itself.

## Optional: MCP, for a client with no shell

Skip this if you drive archboard from Codex or Claude Code. Both have a shell,
and the CLI is the default surface (ADR 0008).

For Claude Desktop or anything else that cannot run a command, add to your MCP
client config:

```toml
[mcp_servers.archboard]
command = "node"
args = ["/home/you/Projects/archboard/dist/bin.js"]
env = { ARCHBOARD_VAULT = "/home/you/vaults/architecture" }
startup_timeout_sec = 20
```

The tool prefix a client shows comes from the key you choose there, not from
anything archboard sets.

## Working in a repo

Start the canvas from anywhere and open a board:

```bash
archboard board new payments --level service
archboard board open payments
```

Bindings resolve from the repository you are standing in. `promote --path
src/payments/index.ts` reads the repo identity from that repo's git origin and
records the branch and commit, so run promotion from inside the repo the code
belongs to. Promoting a path from the wrong working directory records the wrong
repository, and nothing will tell you.

Boards do not belong to the repo and are not committed to it. If you want a
diagram in the repo as well, export one:

```bash
archboard export --out docs/architecture.excalidraw
```

## Telling an agent which board covers this repo

Nothing connects a repository to its board automatically. An agent in a fresh
repo knows archboard exists, from the skill, but not which board to open.

Until that is solved, say so in the repo's own `CLAUDE.md` or `AGENTS.md`:

```markdown
## Architecture

Boards for this service live in the archboard vault as `payments` (current) and
`payments@*` (proposals). Open with `archboard board open payments`.
```

One line, and every agent that reads the file knows where to look.
