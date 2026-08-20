# Using archboard in another repository

Archboard is not a dependency of the repositories you diagram. They never build
it and never import it. You install archboard once on a machine and point it at
whatever repo you happen to be working in.

Setting a repo up does put two things in it, and only two: a block in its
`CLAUDE.md` or `AGENTS.md` saying where everything is, and, if you keep the
boards with the code, a vault directory.

If you are setting up the voice loop rather than the tool, read
[`TESTING.md`](TESTING.md) instead. This is the shorter, per-machine story.

## What actually has to be true

Five things. The first two are once per machine. The last three are once per
repo, and `archboard install-skill` does all three.

1. The archboard build exists somewhere on this machine.
2. An agent can find the CLI.
3. A vault exists, and `ARCHBOARD_VAULT` points at it before the canvas server
   starts.
4. The agent has the skill that teaches it how to draw.
5. The repo itself says where 2 and 3 are, because nothing else will.

Number 5 is the one that used to get skipped. An agent arriving in a repo can
see the skill, so it knows archboard exists and knows the commands. It cannot
see which vault this machine uses, and it cannot see that `archboard` is not on
PATH here. Both of those live in the installing human's head unless the install
writes them down.

## 1. Set it up once

```bash
git clone <your fork> ~/Projects/archboard
cd ~/Projects/archboard
bun install                 # retry if it fails extracting a tarball
bunx vite build             # the frontend, the only thing that is built
```

The package is private and never published, so there is nothing to install from
npm. bun runs the server and the CLI from `src/`, so there is nothing to compile
for them and nothing to rebuild after pulling (ADR 0014) — only the frontend,
and only when `frontend/` changed. **bun has to be on PATH**, including the PATH
of anything that spawns archboard.

## 2. Put the CLI where an agent will find it

Out of the box the only entry point is `./bin/canvas` inside the checkout,
which is useless from another repo. Give it a name on your PATH:

```bash
ln -s ~/Projects/archboard/bin/canvas ~/.local/bin/archboard
```

`bin/canvas` resolves its own location, so the symlink works from any working
directory and always runs the current source. Every example in the skill says
`archboard`, so this is the name to use.

Skipping this is survivable. `install-skill` checks whether an `archboard` on
PATH really points at this build, and when it does not it writes the absolute
path into the repo instead, so the next agent still has something that runs.
The name is nicer, and the skill's examples match it.

## 3. Set up the repo

From inside the repository you want to diagram:

```bash
cd ~/Projects/payments-api
archboard install-skill
```

That does four things:

- copies the skill into a skills root (`--target claude` for `~/.claude/skills`,
  `--target codex` for `~/.codex/skills`, `--dir <path>` for anywhere else)
- asks where this repo's boards should live, offering `<repo>/.archboard/vault`
- creates that directory, so the first board command has somewhere to write
- writes a block into the repo's `CLAUDE.md`, or its `AGENTS.md` when there is
  no `CLAUDE.md`, recording the vault path, the exact command that runs the CLI
  on this machine, and a section for the boards that cover this repo

The block sits between `<!-- archboard:begin -->` and `<!-- archboard:end -->`.
Re-running replaces it in place, so upgrading the skill later never leaves two
of them. Prose outside the markers is untouched. Notes written inside them are
not, so keep your own words outside.

If the repo has neither file, one is created: `CLAUDE.md` for `--target claude`,
which is the default, and `AGENTS.md` otherwise. Never both. A repo with two
agent docs is a repo where one of them is out of date.

Nothing prompts when stdin is not a terminal, which is the case whenever an
agent runs the command. It takes the offered vault and prints what it chose.

| Flag | For |
|---|---|
| `--vault <path>` | name the vault instead of being asked |
| `--yes` | take the offered vault without being asked |
| `--repo <dir>` | set up a repo other than the one you are standing in |
| `--doc <file>` | write the block somewhere other than the repo root |
| `--no-doc` | install the skill and touch nothing in the repo |

**Then fill in "Boards for this repo".** The installer cannot know which board
covers this code, what your levels mean, or the gotcha that will cost the next
agent an hour. That section is where those go, and an agent that finds it empty
has to stop and ask.

On the machine archboard was developed on, `~/.claude/skills/excalidraw-skill`
is a symlink into the checkout, so the skill tracks the build and cannot go
stale. `install-skill` refuses to replace a symlink, which is what you want
there. Running it inside the archboard checkout writes no block either, because
that repo's `CLAUDE.md` is authored rather than generated.

## 4. Where the vault goes

Boards are `.excalidraw.md` notes in an Obsidian vault. The offered answer is a
vault inside the repo, at `<repo>/.archboard/vault`: boards next to the code
they describe, and reviewable in the same diff as the change they justify. It
is not gitignored for you. Commit it or ignore it, deliberately.

Take a shared vault instead when the diagrams span repositories, which is what
an architecture diagram does as soon as there is more than one service in it.
Point every repo at the same path:

```bash
archboard install-skill --vault ~/vaults/architecture
```

An `ARCHBOARD_VAULT` already exported in your shell counts as having answered:
it becomes the offer, in place of the local path.

Either way, **the server does the vault I/O, so the variable has to be set
before the canvas server starts.** Exporting it afterwards changes nothing, and
board commands fail on the vault message rather than on whatever you were
doing. A server that is already running keeps the vault it started with:
`archboard board list` prints the vault in use, and `archboard stop` is how you
switch. That is the one that bites when you move between two repos that each
keep their own boards.

## Optional: MCP, for a client with no shell

Skip this if you drive archboard from Codex or Claude Code. Both have a shell,
and the CLI is the default surface (ADR 0008).

For Claude Desktop or anything else that cannot run a command, add to your MCP
client config:

```toml
[mcp_servers.archboard]
command = "bun"
args = ["/home/you/Projects/archboard/src/bin.ts"]
env = { ARCHBOARD_VAULT = "/home/you/vaults/architecture" }
startup_timeout_sec = 20
```

The client spawns that command, so `bun` has to resolve on the PATH the client
inherits, which for a desktop app is often shorter than your shell's. If the
server never starts, put the absolute path from `which bun` in `command`.

The tool prefix a client shows comes from the key you choose there, not from
anything archboard sets.

## Working in a repo

Start the canvas from anywhere and open a board:

```bash
archboard board new payments --level service
archboard board open payments
```

**Use absolute paths when you promote.** Binding walks up from the resolved
path to find the enclosing git repository, so an absolute path is correct
wherever you happen to be standing:

```bash
archboard promote --kind service --path ~/Projects/payments-api/src/index.ts
```

A relative path is resolved against an ambient working directory, and that is
currently a trap. From the wrong directory, if a file of that name happens to
exist there, you get a confident binding to the wrong repository. Over MCP it
is worse, because a client with no shell cannot set a working directory at all,
so a relative path there resolves by accident rather than by intent. TASK-031
is fixing this. Until it lands, absolute paths are the only reliable form.

`--repo`, `--branch` and `--commit` override the resolution when you need to
name something git cannot tell you.

With a shared vault the boards do not belong to the repo and are not committed
to it. If you want a diagram in the repo as well, export one:

```bash
archboard export --out docs/architecture.excalidraw
```

## On macOS

Archboard was developed on Linux. Most of it is platform-neutral, and the two
places that are not already handle darwin: the pidfile goes to
`~/Library/Application Support`, and so do the logs.

Three things to know.

`bin/canvas` calls `realpath`, which modern macOS has but older versions do
not. If the symlink route above gives you `realpath: command not found`, either
`brew install coreutils` or run `bun /path/to/archboard/src/bin.ts` directly.

**Board names are case-sensitive here and your filesystem probably is not.**
APFS is case-insensitive by default, so `payments` and `Payments` are two
boards in archboard and one file on disk. You will not lose work over it: a
save onto a note archboard has not read is refused rather than overwritten
(ADR 0006), and a note whose frontmatter disagrees with its path says so. But
you will get a puzzling refusal. Pick one casing per board and stay with it
until TASK-032 settles this.

That also means a vault is not yet portable between macOS and Linux if any two
board names differ only in case.

## Telling an agent which board covers this repo

Nothing connects a repository to its board automatically. An agent in a fresh
repo knows archboard exists, from the skill, but not which board to open.

That is what the "Boards for this repo" section of the installed block is for.
Fill it in once the repo has a board:

```markdown
### Boards for this repo

- Boards: `payments` is the architecture as it stands, `payments@*` are
  proposals. Open with `archboard board open payments`.
- Level vocabulary: `service` means one deployable here, not one class.
- Conventions and gotchas: the worker boxes are drawn from the queue's side,
  because that is how the on-call runbook reads.
```

Every agent that reads the file then knows where to look, and what the drawing
conventions are before it starts adding to them.
