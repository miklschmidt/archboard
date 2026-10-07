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

`archboard check --code` reads the registered checkouts and matches the names that the code uses. A match by name only is a _candidate_. A language server (a program that knows where code defines a name) resolves a candidate that joins two parts to its definition. It also resolves the use that an anchor names, such as `ledger.post()` through a value. Evidence that a server resolved can make a warning. A candidate never does.

A language server reads a checkout the way your editor does. For most languages, that runs code of the checkout:

- pyright runs the Python interpreter of the checkout's `.venv`, and the startup hooks of the packages in it.
- clangd runs a helper program that a compile command names for a `native` GPU. The section on C, C++ and Objective-C says more.
- csharp-ls evaluates the MSBuild files of the solution.
- sourcekit-lsp evaluates `Package.swift`.

So archboard starts such a language server only for a checkout where you, or the agent that works in that repository, configured it. Then the Archboard server runs the language server as your editor does. It uses the command and arguments that you configured. It uses the environment of the Archboard server, which is the environment of the command that started it (see [section 5](#5-start-the-archboard-server-and-sign-in-to-codex)). The check adds no flag, no variable and no rewritten file.

A configured server runs the code of that repository. Configure one only for a repository that you work in.

### TypeScript

TypeScript needs no configuration. If all of these are true, the check runs `tsc --lsp --stdio` from the `typescript` package that the checkout installs:

- The package is in `node_modules/typescript` at the root of the checkout.
- The package is version 7 or later. TypeScript 7 is the first version that has a language server.
- The package has the native program for your machine, `@typescript/typescript-<platform>-<arch>`, beside it or inside it.
- The package and the program are inside the checkout once their links resolve.

Otherwise the check runs the `tsc` of the `typescript` package that archboard installs. This is so for an older TypeScript, for no TypeScript, for no native program, and for a link that leads out of the checkout. The check does not look in the parent directories of the checkout. If the `typescript` package of archboard has no native program for your machine either, the check says `language-server-missing` for TypeScript.

In a monorepo, the check reads the root only. A package that installs another version than the root uses the version at the root. `tsc --lsp` loads no plugin that `tsconfig.json` names. This was measured with TypeScript 7.0.2.

### The other languages

Python, C, C++, Objective-C, C# and Swift have no default server. To configure one, follow these steps:

1. Install the server.
2. If you did not register the checkout yet, run `archboard repo add` (see [Code bindings](#code-bindings)).
3. Run this command in the repository:

```bash
archboard repo language-server <language> <command> [--arg=<argument>]...
```

The language is `python`, `csharp`, `swift` or `c`. The language `c` covers C, C++ and Objective-C. The command is a program on the `PATH` of the Archboard server, or the absolute path of a program. Write an argument that starts with `-` as `--arg=<argument>`.

`--repo <identity>` names another registered repository. `--remove` removes the server of the language. `archboard repo list` shows the configured servers of each checkout. `archboard repo forget` removes them with the checkout.

The configuration stays on your machine. It is in `repos.json` with the checkout. If you register the same directory again, the configuration stays. If you register the repository at another directory, the configuration goes.

The Archboard server reads `repos.json` again each time that the check runs. So a running Archboard server uses a configuration that you wrote after it started. The Archboard server looks up a command that is a name on its own `PATH`. That `PATH` is the `PATH` of the command that started it. If that `PATH` lacks the command, give the absolute path of the command. Or run `archboard stop` and run a command again.

If a checkout has no configured server for a language, the check says `language-server-missing` once for the checkout and the language. If the Archboard server cannot find the configured command, the check says the same. The answer names the command that configures one, and the uses stay candidates.

If a server does not start, does not answer within 30 seconds or stops, the check says `language-server-failed` once for that checkout. Then the check starts no other server of that language in that checkout. This includes the other Swift packages and the other C compilation databases of the checkout.

If a server cannot answer about a project yet, the check says `language-server-unready` once for the project. The sections below name each case.

#### Python

Install pyright or basedpyright, for example with `npm install -g pyright` or `pipx install basedpyright`. Then run `archboard repo language-server python pyright-langserver --arg=--stdio`. For basedpyright, run `archboard repo language-server python basedpyright-langserver --arg=--stdio`.

pyright reads `pyrightconfig.json`, or `[tool.pyright]` in the `pyproject.toml`, at the root of the checkout. The check tells pyright the interpreter of a virtual environment in `.venv` or `venv` at the root, as the Python extension of an editor does. Then imports of installed packages resolve. That interpreter runs, and so do the startup hooks of the packages that are installed in it.

A virtual environment outside the checkout, such as one that Poetry or Hatch keeps elsewhere, needs a `venvPath` and a `venv` in the pyright configuration. Without them, pyright uses the `python3` on the `PATH` of the Archboard server.

#### C, C++ and Objective-C

Install clangd, for example with `apt install clangd`, `brew install llvm` or `nix profile install nixpkgs#clang-tools`. Then run `archboard repo language-server c clangd`. The check reads `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hh`, `.hpp`, `.hxx` and `.m` files. It reads `.mm` files only as text.

clangd needs the `compile_commands.json` of the checkout. That file gives the flags of each file: its include directories, its defines and its language. Without it, clangd guesses, and a guess is no better than a candidate. Generate the file once:

- CMake: `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`. This writes `build/compile_commands.json` and builds nothing.
- Make and other build tools: `bear -- make`. This builds the project once.
- Meson: it writes `compile_commands.json` into the build directory.

The check uses the `compile_commands.json` that clangd finds. clangd looks in the directory of the file and in its `build` directory. Then it does the same for each directory above, up to the root of the checkout. Git can ignore the file, and the check still uses it.

If no such file exists, if it is not a list of commands, or if it lists no command, the file gets no server. The check says `language-server-unready` once for it. Generate the file again after you add source files.

The check passes no flag to clangd, so clangd behaves as it does in your editor. It reads the `.clangd` file of the checkout and your own clangd configuration. It runs no compiler and loads no plugin that a command names (`-fplugin=`, `-fpass-plugin=` or `-Xclang -load`). It runs one kind of program of the checkout: when a CUDA, HIP or OpenMP command asks for the `native` GPU, clang runs a helper program to find it. A `-B` directory of the command can hold that program. This was measured with clangd 21.1.8.

On a system where only the compiler knows where the standard headers are, such as NixOS, your editor gives clangd the compilers with `--query-driver=<glob>`. Give it the same way: `--arg=--query-driver=<glob>`. Then clangd runs each compiler that matches the glob.

clangd keeps its background index in `.cache/clangd/index`. The `.cache` directory is next to `compile_commands.json`. If that file is in a `build` directory, the `.cache` directory is next to `build`. Both are inside the checkout, so add `.cache/` to the `.gitignore` of the checkout. The check waits until clangd indexed every file that the database lists. Then the answer for a definition in another file does not depend on which files the check opened first. Do not pass `--background-index=false`: the check then waits 30 seconds and says `language-server-failed`.

On Redis (303 files in `compile_commands.json`, 24 cores, clangd 21.1.8), the first check took 4.7 seconds. Each later check took 1.9 seconds, against 0.15 seconds without clangd.

The check waits at most 30 seconds for the index. If the first index takes longer, the check says `language-server-failed` once and keeps the candidates. LLVM was such a case in an earlier measurement: 54 seconds for 2,283 commands.

#### C#

Install csharp-ls with `dotnet tool install --global csharp-ls`. Then run `archboard repo language-server csharp csharp-ls`. csharp-ls needs the .NET SDK that it was built for on the `PATH` of the Archboard server. csharp-ls 0.28 needs .NET 10.

The check tells csharp-ls to load the `.sln` or `.slnx` file that is nearest the root of the checkout. With no solution, csharp-ls loads every `.csproj` file. The check never asks it to build or to restore packages.

But csharp-ls runs the MSBuild targets of a project up to the compiler, to load the project. So a target that the project hooks there runs, such as an `Exec`. It also writes files under the `obj` directory of each project. If a project names an MSBuild SDK with a version, such as `Microsoft.Build.NoTargets/3.7.56`, MSBuild downloads that SDK from NuGet.

If Git lists no `.sln`, `.slnx` or `.csproj` file in the checkout, the check starts no server. It says `language-server-unready` once for the checkout.

The Roslyn language server is not supported. It loads nothing until the client opens a solution with a message of its own, and by default it restores packages from the network. If you configure it, it answers nothing, and the uses stay candidates. This was measured with csharp-ls 0.28.0 and roslyn-ls 5.11.0.

#### Swift

Run `archboard repo language-server swift sourcekit-lsp`. sourcekit-lsp evaluates `Package.swift`, which runs code of the checkout.

sourcekit-lsp builds a package itself on the first run to prepare its background index. Background indexing is on by default in Swift 6.1 and later. The check passes no option that changes it, and a package can set its own options in `.sourcekit-lsp/config.json`.

The check starts sourcekit-lsp in the package that holds the file. It waits for `workspace/synchronize` with `index: true` to finish the build graph and index before it asks for definitions. The server keeps its index database and a module cache under `.build`, as it does in your editor. A first check can take longer than a later check because the server prepares the package.

If no `Package.swift` holds the file, the check says `language-server-unready` once. Its uses stay candidates.

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
- The state directory. It holds the Codex sign-in, `repos.json` (with the
  configured language servers of each checkout), the opener configuration, the
  server process files, the log and the kept talks of recordings.

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
