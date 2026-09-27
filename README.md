![archboard: an architecture drawn as a room-scale hologram](docs/assets/archboard-banner-enterprise-dark.png)

# archboard

Archboard is a private internal tool for architecture diagrams that agents
write. A coding agent reads the code and states what the system is: its parts,
the parts that contain other parts, how the parts relate, and the order of the
messages between them. Archboard draws the diagram, and you read it in a
browser.

A board is one named diagram of one part of a system, or of one question about
it. A board is an architecture diagram, a sequence diagram, or both. You cannot
move a box on a board, by design. The renderer owns every position, color and
line. For this reason, one improvement to the renderer improves every board at
once.

```text
agent reads code  ->  states the architecture  ->  the renderer draws it
      ^                                                       |
      +------------------ you read it back ------------------+
```

## What it does

Archboard does these things:

- It keeps each board as one `<name>.semantic.json` file in a vault. The vault
  is the directory that holds the boards. The file holds every variant of the
  board. A variant is one version of the architecture, for example the current
  one or a proposal.
- It draws each board in the browser. It also renders a board to an SVG or a
  PNG file, and the same board always gives the same picture.
- It compares every variant with the current one: a proposal, and also an
  older, historical variant. The picture marks the parts and relationships
  that the variant adds, changes or removes compared with the current one. A
  board that nobody has built yet has no current variant, so there a proposal
  is compared with the variant that it was branched from.
- It binds a node to a path in a repository, so you can open the code that the
  node stands for. A node is one part of the system on a board.
- It narrates a walkthrough with the Codex voice while you step through it, and
  it shows subtitles. A walkthrough is an ordered explanation of a variant.
- It records a walkthrough to a narrated video, for example for the reviewers
  of a pull request.

The CLI is the interface for agents. A connected browser shows each change as
soon as the server writes it. The browser writes nothing to a board. In the
browser, a person can select parts, which the agent and the voice can read. A
person can also take back the claim of an agent on a board.

## Project status

Archboard is a private internal tool, and its development continues. Its
interfaces change often. It is not on npm, and the `private` flag in
`package.json` prevents an accidental publication. The code is available under
the [Business Source License 1.1](LICENSE).

## Quick start

You need these things:

- Bun 1.4 or newer, and Git.
- Chromium or Google Chrome, for PNG files and videos.
- A Codex sign-in on the Archboard server, for the voice and for videos. You sign in from
  the agent bar in the browser.

```bash
git clone https://github.com/miklschmidt/archboard.git
cd archboard
bun install
bun run build

export ARCHBOARD_VAULT=/path/to/a/vault
./bin/archboard start
```

Archboard has no default vault, by design. The server does not start until
`ARCHBOARD_VAULT` points to a directory. That directory becomes the vault. Its
`.archboard/config.yaml` file holds the kinds of node and relationship that the
boards can use.

If the server is not running, every command that talks to it starts it. If you
do not want this, set `ARCHBOARD_NO_AUTOSTART=1`.

Open <http://127.0.0.1:3000>. Then create a first board and read it back:

```bash
./bin/archboard semantic new payments --doing "describing payment processing" <<'JSON'
{
  "level": "system",
  "nodes": [
    { "name": "Gateway", "kind": "service", "responsibility": "Routes incoming requests" },
    { "name": "Orders", "kind": "service", "responsibility": "Accepts and tracks orders" }
  ],
  "edges": [{ "from": "Gateway", "to": "Orders", "kind": "http", "label": "place order" }]
}
JSON

./bin/archboard semantic show payments
./bin/archboard semantic render payments --out payments.svg
```

Two rules make each write visible and safe:

1. Every write says what it does in a short `--doing` line, in the present
   tense. Each pane that shows the board shows this line.
2. Every change to an existing board states, with `--expect-version`, the
   version that the agent read. If the board changed after that version, the
   server refuses the change, and the agent must read the board again.

Run `./bin/archboard --help` to see all the commands. Run
`./bin/archboard help <command>` to see the arguments and options of one command.

## Common tasks

These commands do the most frequent work. Each command that changes a board
also needs `--expect-version` and `--doing`.

```bash
# List the boards in the vault, and change one.
archboard semantic
archboard semantic edit payments --input change.json
# Propose a change, see what it changes, and make it the current architecture.
archboard semantic branch payments --as "Queued ingest"
archboard semantic compare payments --variant "Queued ingest"
archboard semantic adopt payments --variant "Queued ingest" --reason "<why>"
# Draw a PNG file, record a walkthrough, and show a board in a browser pane.
archboard semantic rasterize payments --out payments.png
archboard semantic record payments --out talk.mp4
archboard browser show payments --pane right
```

If `ffmpeg` is on `PATH`, the sound of a recorded MP4 plays in every browser,
Safari included.

## Use it from another repository

You install archboard once on each machine. It is not a dependency of the
codebase that you diagram. Put `bin/archboard` on your `PATH`. Then run the
installer from the repository that you want an agent to understand:

```bash
mkdir -p ~/.local/bin
ln -s /path/to/archboard/bin/archboard ~/.local/bin/archboard

cd /path/to/your-project
archboard install-skill
```

The installer copies the archboard skill into a skills directory
(`~/.agents/skills` by default). The skill is the set of instructions that
teaches an agent to use archboard. The installer then writes the vault path and
the command for this machine into the `CLAUDE.md` or `AGENTS.md` file of the
repository. See [INSTALL.md](INSTALL.md) for the options, shared vaults and
repository bindings.

After the installation, ask the agent to map the current architecture onto a
named board. A typical comparison branches that board into a proposal and shows
the two variants side by side:

```bash
archboard semantic branch payments --as "Queued ingest" --expect-version 1 \
  --doing "proposing a queue"
archboard browser open
archboard browser show "payments@Queued ingest" --pane right
```

## How archboard keeps boards safe

The file is the board. Archboard does not keep a second copy of a board in
memory. The server writes each accepted change to the file of the board
atomically, and then answers. Atomically means completely or not at all.

Only one agent writes to a board at a time. For substantial work, an agent
claims the board with `archboard claim --board <board> --reason "<why>"`, and
it runs `archboard release --board <board>` at the end. While an agent holds a
claim, each pane that shows the board says who holds it, why, and since when.
The pane also shows a control that takes the claim back. If a person takes the
claim back, the next write of the agent fails one time, and the agent stops.

The code binding of a node is part of its meaning, and it travels with the
board as a repository name and a path. It is not a `file://` URL that works on
one machine only. To open the code from a board, run `archboard repo add` in
each checkout of the repository on this machine.

## Codex and the voice

The Archboard server runs its own private Codex app-server session, with its own Codex
state and sign-in. The server links to one workhorse, the Codex thread that
does the long work, and all panes share that link. The first message or the
first press of Talk makes the link. The voice talks through a separate
coordinator thread, so the conversation and the long work do not share a
history. The
[bound app-server design](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session)
gives the full contract.

## Security

Keep the Archboard server on loopback, which only this machine can connect to. The server
has no authentication, so any process that can connect to its port can use it.
By default, the server binds to `127.0.0.1`. To connect from another machine,
use an SSH tunnel. Do not expose the server directly to a network.

## Documentation

These files give more detail:

- [INSTALL.md](INSTALL.md): install archboard for use across repositories.
- [TESTING.md](TESTING.md): run the complete Codex, voice and canvas loop.
- [DESIGN.md](DESIGN.md): the product design, constraints and roadmap.
- [CONTEXT.md](CONTEXT.md): the domain language of the CLI and the
  documentation.
- [docs/adr/](docs/adr/): architectural decisions and their consequences.
- [AGENTS.md](AGENTS.md): the instructions for agents that work on this
  repository.
