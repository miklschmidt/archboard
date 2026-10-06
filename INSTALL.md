# Installing archboard for other repositories

You install archboard once on a machine. The repositories that you diagram do
not build or import it. Setup puts a block of instructions in the `CLAUDE.md` or
`AGENTS.md` file of a repository. If you keep the boards with the code, setup
also puts a vault directory in the repository. The vault is the directory that
holds the boards. Each board is one `<name>.semantic.json` file in it.

This document is also the installation reference for agents: the installed
skill carries a copy of it. To set up the voice loop for development of
archboard itself, read [TESTING.md](TESTING.md).

## What you need

You need these things:

- Linux or macOS, Bash, Git, and Bun 1.4 or newer. Bun must be on the `PATH` of
  every process that runs archboard.
- A desktop browser, to read the boards. The browser layout is for desktop
  screens only.
- Chromium or Google Chrome, only to draw PNG files and to record videos.
- `ffmpeg` with libx264 and aac, or Nix, only to record videos. If there is no
  `ffmpeg`, the recorder runs `nixpkgs#ffmpeg-headless` through Nix.

## 1. Install archboard on the machine

Run these commands once:

```bash
git clone https://github.com/miklschmidt/archboard.git ~/Projects/archboard
cd ~/Projects/archboard
bun install
bun run build
```

If `bun install` fails while it extracts a package, run it again. `bun install`
also installs the Codex version that archboard is pinned to, inside the
checkout, and generates the contract for it. The Archboard server does not start unless
that Codex passes its checks. A Codex on your `PATH` is not used.

`bun run build` builds the browser application into `dist/frontend`. Without
it, the page tells you to run the build. The server and the CLI run from the
TypeScript in `src/`, so nothing else is built. After each `git pull`, run
`bun install` and `bun run build` again.

## 2. Put the CLI on your PATH

The entry point is `bin/archboard` in the checkout. Give it the name `archboard` on
your `PATH`, because the skill uses that name:

```bash
mkdir -p ~/.local/bin
ln -s ~/Projects/archboard/bin/archboard ~/.local/bin/archboard
```

`bin/archboard` finds its own location with `realpath`, so the link works from any
directory. If you skip this step, the installer in the next step writes the
absolute path of the CLI into the repository instead.

## 3. Set up a repository

Run the installer from the repository that you want to diagram:

```bash
cd ~/Projects/payments-api
archboard install-skill --agent claude-code
```

Use `--agent claude-code` for Claude Code. Without it, the installer sets up
Codex. The installer does these things:

1. It copies the archboard skill into a skills directory. The default is
   `~/.agents/skills/archboard`, which Codex reads. With `--agent claude-code`
   it is `~/.claude/skills/archboard`. The copy replaces an earlier copy. If
   the target is a symlink, the installer stops and changes nothing.
2. It chooses the vault. If `ARCHBOARD_VAULT` is set, it offers that vault.
   If not, it offers `<repo>/.archboard/vault`. If it runs in a terminal, it
   asks you. If an agent runs it, it takes the offer.
3. If the vault directory does not exist, it creates it, with a
   `.archboard/config.yaml` file that holds the default vocabulary. The
   archboard skill explains that file to the agents that write boards.
4. If the repository has a `CLAUDE.md` file, it writes a block into it.
   Otherwise, it writes the block into `AGENTS.md`. The block gives the location of the
   skill and the vault of the repository. It also gives the command that runs
   the CLI on this machine, and the Archboard server URL.

The repository is the nearest parent directory that holds `.git`. The block
sits between `<!-- archboard:begin -->` and `<!-- archboard:end -->`. When you
run the installer again, it replaces the block in place. Text outside the
markers does not change, but text inside them does. If the repository has
neither file, the installer creates `CLAUDE.md` for Claude Code and `AGENTS.md`
otherwise, and never both. The installer writes no block in the archboard
checkout itself.

The installer prints what it did, and a JSON receipt. If the vault is inside the
repository and Git does not ignore it, the installer warns you. Commit the
vault or ignore it, as you choose.

These options change what the installer does:

| Option                | Effect                                                               |
| --------------------- | -------------------------------------------------------------------- |
| `--agent claude-code` | Install for Claude Code, in `~/.claude/skills`.                      |
| `--agent codex`       | Install for Codex, in `~/.agents/skills`. This is the default.       |
| `--target claude`     | The same as `--agent claude-code`. `--target agents` is the default. |
| `--dir <skills-root>` | Install into `<skills-root>/archboard`.                              |
| `--vault <path>`      | Use this vault. A relative path starts from the current directory.   |
| `--yes`               | Take the offered vault without a question.                           |
| `--repo <dir>`        | Set up this repository instead of the current one.                   |
| `--doc <file>`        | Write the block into this file.                                      |
| `--no-doc`            | Install the skill only. Write no block and create no vault.          |
| `--print-source`      | Show the skill directory to install, and install nothing.            |

Use one of `--agent`, `--target` and `--dir` at most. Do not use `--doc` and
`--no-doc` together.

The installer does not read the block that is already in the repository. If a
repository uses a shared vault, give `--vault` again when you run the installer
again. If you use `--yes` without `--vault` and without `ARCHBOARD_VAULT`, the
repository changes to `<repo>/.archboard/vault`.

## 4. Set the vault before the Archboard server starts

The installer writes the `export ARCHBOARD_VAULT=...` line into the block, but
it does not set the variable in your shell. Set it yourself, or put it in a
`.env` file in the directory where you run the commands. The server does not
start without a vault, and its message points to `archboard install-skill`.

The Archboard server reads and writes the vault. A running server keeps the vault
that it started with. To change the vault, run `archboard stop`, set the new
vault, and run a command again. `archboard semantic config` shows the
configuration file of the vault in use, which is inside that vault.

A vault in the repository keeps the boards next to the code. A reviewer can then
read a board change in the same diff as the code change. When the diagrams
cover more than one repository, use one shared vault for all of them:

```bash
archboard install-skill --agent claude-code --vault ~/vaults/architecture
```

While an agent works on a board, archboard keeps a lock file for it in
`<vault>/.archboard/locks/`. If you commit the vault, ignore that directory.

## 5. Start the Archboard server and sign in to Codex

If the server is not running, every command that talks to it starts it. If you
do not want this, set `ARCHBOARD_NO_AUTOSTART=1`. `archboard start` starts the
server in both cases. The server uses the environment of the command that
started it.

The server listens on <http://127.0.0.1:3000>. To use another address, set
`ARCHBOARD_URL`, or give `--url` to one command. A command starts a server only
for a loopback address, that is, an address that only this machine can reach.
The old variable `EXPRESS_SERVER_URL` is refused with a message.

Several Archboard servers can run on one machine at the same time, each on its own port.
The Codex agents of a server run `archboard` against that server and its vault, and they
never start another server. They share one Codex sign-in. If you sign out in one server, you sign out of all
of them. A server that is already running shows a sign-in or a sign-out from
another server only after you restart it.

Open the server URL in your browser. The conversation, the voice and video
recording need a Codex sign-in. Sign in from the agent dock, with ChatGPT or with
an OpenAI API key. The sign-in is kept apart from your own `~/.codex`, in
`codex-workbench/codex-home` in the state directory.

## 6. Make sure that it works

Run these commands in the repository:

```bash
archboard status          # the server runs, and at which URL
archboard check           # the vault configuration and every board are valid
archboard semantic config # the vocabulary in use, and the configuration file
```

Then create a test board with `archboard semantic new`, and read it with
`archboard semantic show`. The first session in [TESTING.md](TESTING.md) has an example.

## Code bindings

A node can bind to a file in a repository, as `binding: { repo, path }`, with an
optional `symbol`, `branch` and `commit`. The board stores the identity of the
repository and a path in the repository. It never stores an absolute path, so
the same board opens the correct file on any machine.

If a binding names a branch or a commit, the checkout must have that ref out for
the local file to open. A named commit decides over a named branch. If the
checkout is on another ref and the repository is on GitHub, the browser tells
you both refs. It also offers the file on GitHub at the named ref. Archboard never changes the
branch of your checkout. If the repository is not on GitHub, the browser opens
the local file and tells you which ref the binding names.

To open the code from a board, register each checkout on each machine:

```bash
archboard repo add ~/Projects/payments-api
```

The identity of the repository comes from its `origin` remote. If the repository
has no remote, the identity is the directory name. `archboard repo list` shows the
registered checkouts, and `archboard repo forget <identity>` removes one. The
list is in `repos.json` in the state directory, or in the file that
`ARCHBOARD_REPOS` names.

If a checkout is registered, the browser opens the file with the opener in the
browser configuration. By default, that is `xdg-open` on Linux and `open` on
macOS. You can also choose Visual Studio Code, Cursor, Zed or a custom command.
If a binding names a `symbol`, Archboard finds the line where the file defines
it. For now, it reads TypeScript and TSX files only. Visual Studio Code, Cursor
and Zed open the file at that line. A custom command is a list of arguments.
Exactly one of them holds `{path}`, which becomes the file to open. Any of them
can hold `{line}`, which becomes the line of the symbol. If there is no such
line, `{line}` becomes 1. For example: `--goto` and `{path}:{line}`.

If there is no checkout of a GitHub repository, the browser opens the file on
GitHub. It uses the commit, then the branch, then the default branch.

## Language servers for the code check

`archboard check --code` reads the registered checkouts and matches the names
that the code uses. A match by name only is a _candidate_. A language server
resolves a candidate that joins two parts to its real definition. It also
resolves the use that an anchor names, such as `ledger.post()` through a
value. Evidence that a server resolved can make a warning, and a candidate
never does.

For TypeScript you need nothing more. The check runs `tsc --lsp --stdio` from
the `typescript` package that archboard installs, never the TypeScript of the
checkout. It loads no plugin of the checkout, and it never asks a server to
build. The check starts a server at most once for each checkout that it reads,
or for Swift each package, on its first question. It stops the server before
the check answers.

For Python, install pyright or basedpyright, for example with
`npm install -g pyright` or `pipx install basedpyright`. The check runs the
first of `pyright-langserver` and `basedpyright-langserver` that is on your
`PATH`. pyright reads `pyrightconfig.json` or `[tool.pyright]` in the
`pyproject.toml` at the root of the checkout. If the checkout has a virtual
environment in `.venv` or `venv` at its root, the check tells pyright to use
it, so imports of installed packages resolve. It does this only when Git
tracks no file in that directory, because pyright runs its interpreter once to
find the packages. A virtual environment outside the checkout, such as one
that Poetry or Hatch keeps elsewhere, needs a `venvPath` and `venv` in the
pyright configuration. Without one, pyright uses the `python` on your `PATH`.

To choose another server, or to turn one off, write `language-servers.json` in
the state directory (see [Machine state and logs](#machine-state-and-logs)).
Each key is a language, and each value is a command or `false`:

```json
{
	"typescript": { "command": "/opt/tsgo/bin/tsgo", "args": ["--lsp", "--stdio"] }
}
```

`command` is a program on your `PATH` or the absolute path of a program.
`args` is optional. `false` turns the language off. The languages are
`typescript`, `python`, `csharp` and `swift`. Each check reads the file again, so a change needs no
restart. A file that is not valid turns every server off until you correct it.

C# has no default server. csharp-ls evaluates the MSBuild files of the
solution, and those can run code of the checkout. So the check starts it only
from an entry that you write. Write that entry only for checkouts that you
trust:

```json
{
	"csharp": { "command": "csharp-ls" }
}
```

Install csharp-ls with `dotnet tool install --global csharp-ls`. It needs the
.NET SDK that it was built for on your `PATH`: csharp-ls 0.28 needs .NET 10.
The check tells it to load the `.sln` or `.slnx` file that is nearest the root
of the checkout. With no solution, csharp-ls loads every `.csproj` file. The
check never asks it to build or to restore packages. Its MSBuild evaluation
still writes files under the `obj` directory of each project. A checkout with
no `.sln`, `.slnx` or `.csproj` file that Git lists starts no server. The
check says `language-server-unready` once for it, and its uses stay
candidates. The Roslyn language server is not supported: it loads nothing
until the client opens a solution with a message of its own, and by default it
restores packages from the network. This was measured with csharp-ls 0.28.0.

Swift has no default server. sourcekit-lsp evaluates `Package.swift`, and that
runs code of the checkout. So the check starts it only from an entry that you
write. Write that entry only for checkouts that you trust:

```json
{
	"swift": { "command": "sourcekit-lsp" }
}
```

sourcekit-lsp finds a definition in another file through an index. A build
writes that index. So build each Swift package once with `swift build`. Swift
6.2 writes the index on Linux by default. Swift 5.10 on Linux writes it only
with `--enable-index-store`.

The check never builds. It starts sourcekit-lsp in the package that holds the
file, with background indexing off. Then the server reads the index under
`.build/debug/index/store`, and it never runs `swift build` itself. The check
says `language-server-unready` once for each package that it cannot ask:

- a package that has no index
- a package whose `.sourcekit-lsp/config.json` turns background indexing on
- a Swift file that no `Package.swift` holds

The uses in such a package stay candidates. The index holds only what the last
build saw, so build again after you add code. This was measured with
sourcekit-lsp 6.2.4.

A server can be absent: not installed, turned off, or named in a file that is
not valid. Then the check says so once for each language with the reason
`language-server-missing`, and reports candidates. If a server does not start,
does not answer within 30 seconds or stops, the check says so once for that
checkout with `language-server-failed`.

## Rendering to a bitmap

`archboard semantic render <board> --out <file.svg>` writes an SVG with its
fonts in it, and needs no browser. `archboard semantic rasterize <board> --out
<file.png>` draws the same picture to a PNG in a private headless Chromium.
Both take `--variant`, `--view` and `--theme`.

The CLI starts the browser itself, with a private temporary profile, and stops
it and removes the profile before the command ends. It uses the first of
`chromium`, `chromium-browser`, `google-chrome` and `google-chrome-stable` on
`PATH`, and on macOS also the standard applications in `/Applications`. To use
another browser, set `ARCHBOARD_RENDERER_CHROMIUM` to its executable in the
environment of the command. If there is no browser, the command stops with exit
status 4 and writes nothing.

The PNG has these properties:

- One bitmap pixel is one diagram pixel. `--scale` takes 0.25 to 4. The size
  does not depend on the display or on a pane.
- The PNG shows the whole diagram, with a margin of 20 px. `--region x,y,w,h`
  draws one part of it. A bitmap larger than 16384 px on a side or 80 million
  pixels is refused with exit status 2.
- All the fonts load before the capture, or the command fails. Moving traffic
  marks show their first frame.
- The receipt gives the file, the size, the scale, the board, its version, the
  variant and view that it drew, and the SHA-256 of the SVG that it drew.

## Recording a walkthrough

`archboard semantic record <board> --out <file.mp4>` presents one walkthrough,
and the Codex voice of the server narrates it. The command writes an MP4 or a
WebM file. It is how an agent gives the reviewers of a pull request a narrated
video of the change. The voice speaks English, whatever language the steps
are written in. `--language` names another language as a BCP 47 tag, such as
`da`, `fr` or `pt-BR`. `--discard --doing "<why>"` deletes the board after the
file is written, for a board made only for the video.

The command makes a recording in two passes:

1. The talk. A private Chromium shows the walkthrough while the voice explains
   it. When the voice falls silent, it moves to the next step. It keeps the
   voice and the moment of each step and subtitle line. This pass takes as long
   as the talk.
2. The picture. A second private Chromium draws the video from the talk, one
   frame every 1/30 s, and `ffmpeg` encodes the frames with the voice. No voice
   runs in this pass. Several Chromium pages draw it at once, as many as the
   machine keeps busy: on 2026-09-30, a machine with 24 threads rendered a talk
   of 85 s in 49 s.

The command keeps the talk, a directory with `talk.json` and `voice.wav`, and
the receipt's `talk` names it. By default the talk goes to `recordings/` in the
state directory, which keeps the newest 10 talks. `--talk <dir>` keeps it in a
directory that does not exist yet, and nothing removes it there.
`archboard semantic replay <talk> --out <file.mp4>` renders a kept talk again,
with no voice session. Use `--theme dark` for the other palette, or render
again after you update archboard. The board need not exist. If a render fails,
the command refuses with `RENDER_FAILED`, keeps the talk and names the
`semantic replay` command that renders it again.

A recording needs these things:

- The Chromium that rasterizing needs.
- An `ffmpeg` with the encoders libx264 and aac, or libvpx-vp9 and libopus for
  a WebM file. The recorder first uses the one that `ARCHBOARD_FFMPEG` names,
  then the one on `PATH`. Without either, it runs `nixpkgs#ffmpeg-headless`
  through Nix, which fetches it on the first recording. If there is none of
  these, or the one named cannot encode, the command refuses with
  `ENCODER_UNAVAILABLE` before it starts a browser.
- An Archboard server where Codex is signed in. Voice can be live in a browser
  tab meanwhile, because the recording runs in a tab of its own. A replay needs
  the server but no Codex sign-in.
- A frontend built from the same checkout, with `bun run build`.

To attach the file to a pull request, use `gh pr comment --attach`, which needs
gh 2.99 or newer.

## Update and remove

To update archboard, run `git pull`, `bun install` and `bun run build` in the
checkout, then run `archboard stop`. `archboard status` reports a server that
runs older source. Run `archboard install-skill` again in each repository to
update its copy of the skill and its block.

There is no uninstall command. To remove archboard, delete these things:

- The skill directory, for example `~/.agents/skills/archboard`.
- The block between the markers in each repository.
- The `archboard` link on your `PATH`.
- The state directory. It holds the Codex sign-in, `repos.json`, the opener
  configuration, `language-servers.json`, the server process files, the log
  and the kept talks of recordings.

If you do not want to keep the boards, delete the vault too.

## Machine state and logs

Archboard keeps its machine state apart from the vault, because the vault can
move between machines. The state directory and the log are in these places:

| System | State directory                                                    | Log                                    |
| ------ | ------------------------------------------------------------------ | -------------------------------------- |
| Linux  | `$XDG_STATE_HOME/archboard`, by default `~/.local/state/archboard` | `archboard.log` in the state directory |
| macOS  | `~/Library/Application Support/archboard`                          | `~/Library/Logs/archboard.log`         |

`LOG_FILE_PATH` sets another log file.

## Notes for macOS

On macOS, archboard examines processes through the macOS process API. On Linux
it uses `/proc`.

The browser that `semantic rasterize` and `semantic record` start uses the
account home for system services, and it keeps its profile private. It uses a
mock keychain, so it opens no keychain dialogs. A managed Chrome installation
can ask to become the default browser, even with a temporary profile. If it
does, install Chrome for Testing and set `ARCHBOARD_RENDERER_CHROMIUM` to its
executable.

`bin/archboard` uses `realpath`, which older macOS versions do not have. If you see
`realpath: command not found`, run `brew install coreutils`, or run
`bun ~/Projects/archboard/src/bin.ts` directly.

Board names do not depend on case, on both Linux and macOS. If a vault has two
boards whose names differ only in case, `archboard check` reports them as
`DUPLICATE_BOARD`.
