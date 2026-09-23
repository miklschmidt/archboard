![archboard: a person shapes a room-scale hologram of a cloud architecture](docs/assets/archboard-banner-enterprise-dark.png)

# archboard

Archboard is a live architecture canvas. A coding agent states what a system
is, and the renderer draws it.

The agent reads the code and states the architecture as meaning: the parts,
the parts that contain other parts, and the relationships between them. The
renderer owns every coordinate, color and connector route. For this reason, one
improvement to the renderer improves every board at once. A board is one named
architecture diagram. You read the board, compare a proposal with what exists,
and follow a node to the code that it is bound to. A node is one part of the
system on a board.

```text
agent reads code  ->  states the architecture  ->  the renderer draws it
      ^                                                       |
      +------------------ you read it back ------------------+
```

Archboard is for architecture work, not for general diagrams. It helps you
understand an existing system and compare it with a proposal. It also keeps
each node connected to the code that the node represents.

## What it does

Archboard does these things:

- It keeps each named board as one `.semantic.json` document in an Obsidian
  vault. A vault is the directory that holds the boards. The document holds
  every variant of the board. A variant is one version of the architecture,
  for example the current one or a proposal.
- It shows the current architecture and a proposal side by side. Then it gives
  a semantic comparison of the two: the parts and relationships that the
  proposal adds, changes or removes.
- It gives agents short ways to read the whole board, its subjects, and the
  items that a person selected. A subject is a node, a relationship, a flow or
  a step.
- It binds nodes to repositories and source paths, so each node leads to the
  code that it stands for.
- It renders deterministic SVG and PNG files: the same board always gives the
  same picture. It narrates a walkthrough aloud as the user steps through it. A
  walkthrough is an ordered explanation of the board.
- It gives access to the canvas through a CLI for agents. It also gives a
  loopback REST API to the application and to local integrations. Loopback
  means that only this machine can connect.

The CLI is the primary interface. A coding agent can use it to operate the
canvas from any shell. A connected browser shows each committed change at once.
But work on named boards does not need a browser session.

## Project status

Archboard is experimental, and its development continues. The core round trip
works and has tests: an agent can write a board, a user can edit it in the
browser, and the agent can read the edited structure and metadata back. The
architecture vocabulary and the higher-level workflows still change. Expect the
interfaces to change before a stable release.

Archboard comes as source code only. It is not on npm. The `private` flag in
`package.json` prevents an accidental publication of the package. The flag
does not restrict the use of this repository. The code is available under the
[Business Source License 1.1](LICENSE).

## Quick start

You need [Bun](https://bun.sh/) 1.2 or newer, and Git. The server and the CLI
run directly from TypeScript. Only the browser frontend needs a build.

```bash
git clone https://github.com/miklschmidt/archboard.git
cd archboard
bun install
bun run build

export ARCHBOARD_VAULT=/path/to/an/obsidian-vault
./bin/canvas start
```

Archboard has no default vault, by design. Every board is a note: its
`.semantic.json` document in the vault, with all its variants. For this reason,
the server does not start until `ARCHBOARD_VAULT` points to the directory for
those notes. Set `ARCHBOARD_VAULT` before you start the server. You do not need
the Obsidian application. The vault is only the directory that holds the board
notes.

Open <http://127.0.0.1:3000>. Then create a first board and read it back:

```bash
./bin/canvas semantic new payments --doing "describing payment processing" <<'JSON'
{
  "level": "system",
  "nodes": [
    { "name": "Gateway", "kind": "service", "responsibility": "Routes incoming requests" },
    { "name": "Orders", "kind": "service", "responsibility": "Accepts and tracks orders" }
  ],
  "edges": [{ "from": "Gateway", "to": "Orders", "kind": "http", "label": "place order" }]
}
JSON

./bin/canvas semantic show payments
./bin/canvas semantic render payments --out payments.svg
```

Two rules make collaboration visible and clear:

1. Every write says what it does in a short `--doing` line, in the present
   tense. The canvas shows this line while the server writes the change.
2. Every change to an existing board states, with `--expect-version`, the
   version that the agent read. If the board changed after that version, the
   server refuses the change.

Run `./bin/canvas --help` to see all the commands. Run
`./bin/canvas help <command>` to see the help for one command. That help lists
the arguments and options that the command reads, and the shared options that
apply to it. You do not need a browser to read, write or render a board. Only
the `browser ...` commands examine or control a connected browser session.

## Use it from another repository

You install archboard once on each machine. It is not a dependency of the
codebase that you diagram. Put `bin/canvas` on your `PATH`. Then run the
installer from the repository that you want an agent to understand:

```bash
mkdir -p ~/.local/bin
ln -s /path/to/archboard/bin/canvas ~/.local/bin/archboard

cd /path/to/your-project
archboard install-skill
```

The installer copies the bundled agent skill and chooses or creates a vault.
The agent skill is the set of instructions that teaches an agent to use
archboard. The installer also writes two facts into the agent instructions of
the target repository: the command for this machine and the vault path. See
[INSTALL.md](INSTALL.md) for target options, shared vaults and repository
bindings.

After the installation, ask the agent to map the current architecture onto a
named board. A typical comparison branches that board into a proposal and
opens the two variants side by side:

```bash
archboard semantic branch payments --as "Queued ingest" --expect-version 1 \
  --doing "proposing a queue"
archboard browser open
archboard browser show "payments@Queued ingest" --pane right
```

You cannot move a box, by design. A layout that a person repaired by hand
cannot get an improvement that the renderer gives every other board. Ask the
agent what the proposal changes instead.

## How persistence and collaboration work

The file is the board. Archboard does not keep a second authoritative copy in
memory. The server writes every accepted agent change atomically to the
`.semantic.json` document of the board. Atomically means completely or not at
all. A running browser renders what that document contains.

The server coordinates the writes for each board. An agent claims a board for
substantial work and states what each write does. After a version conflict,
the agent reads the board again. It does not send the same write again without
a new read. The claim of an agent on a board is a lease. A lease never blocks a
person, and the canvas stays responsive.

The code binding of a node is part of its meaning. The binding travels with the
board. It is not a `file://` URL that works on one machine only. The links to
code that you can open come from that portable binding. They also come from
the list of repository checkouts on this machine.

Each live pane can link to one Codex workhorse. A pane is one of the side-by-side
areas of the canvas. The workhorse is the Codex thread that does the
long implementation work. The voice uses a separate coordinator thread for
that link, so the conversation and the implementation do not share a history.
The
[bound app-server design](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session)
defines semantic delivery, refusal, and uncertain outcomes.

## Security

Keep the canvas on loopback. The canvas has no authentication, so any process
that can connect to its port can use it. By default, the canvas binds to
`127.0.0.1`. To connect from another machine, use an SSH tunnel. Do not expose
the canvas directly to a network.

Archboard owns one private Codex app-server session. The session belongs to
this package and uses stdio (the standard input and output of a child process).
Archboard gives that child process its own Codex state, configuration and
sign-in. The retired shared-daemon and control-socket paths are not available.

## Documentation

These files give more detail:

- [INSTALL.md](INSTALL.md): install archboard for use across repositories.
- [TESTING.md](TESTING.md): run the complete Codex, voice and canvas loop.
- [DESIGN.md](DESIGN.md): the product design, constraints and roadmap.
- [CONTEXT.md](CONTEXT.md): the domain language of the CLI and the
  documentation.
- [docs/adr/](docs/adr/): architectural decisions and their consequences.
- [AGENTS.md](AGENTS.md): instructions for contributors and development.

## Provenance

Archboard started as a fork of an upstream MCP drawing server at v2.0.0
(`6ddbe98`). The repository keeps the full upstream history.

The project now differs from upstream on purpose. It follows a workflow in
which agents author the architecture, and it does not stay mergeable with
upstream. The upstream remote is still useful for reference and for selected
fixes. [LICENSE](LICENSE) keeps both copyright notices.
