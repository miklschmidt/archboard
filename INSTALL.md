# Installing archboard for other repositories

You install archboard once on a machine. The repositories that you diagram do
not build or import it. Setup puts a vault directory, `.archboard/vault`, in a
repository. The vault is the directory that holds the boards. Each board is one
`<name>.semantic.json` file in it. Setup adds nothing else to the repository.

This document is also the installation reference for agents: the installed
skill carries a copy of it. To set up the voice loop for development of
archboard itself, read [TESTING.md](TESTING.md).

## What you need

You need these things:

- Linux or macOS, Bash, Git, and Bun 1.4.3 or newer. Bun must be on the `PATH` of
  every process that runs archboard.
- Node.js that satisfies `^22.18.0 || ^24.11.0 || >=26.0.0`, for the Vite+ build and validation tools.
- A desktop browser, to read the boards. The browser layout is for desktop
  screens only.
- Nix with flakes, to build the renderer core. `nix develop` in the checkout
  gives Bun and the Rust tools. Without Nix, install the Rust toolchain with the
  `wasm32-unknown-unknown` target, `lld`, and `wasm-bindgen-cli` 0.2.129.
- Chromium or Google Chrome, only to draw PNG files and to record videos.
- `ffmpeg` with libx264 and aac, or Nix, only to record videos. If there is no
  `ffmpeg`, the recorder runs `nixpkgs#ffmpeg-headless` through Nix.

## 1. Install archboard on the machine

Run these commands once:

```bash
git clone https://github.com/miklschmidt/archboard.git ~/Projects/archboard
cd ~/Projects/archboard
nix develop
bun install
bun run build
```

If `bun install` fails while it extracts a package, run it again. `bun install`
also installs the Codex version that archboard is pinned to, inside the
checkout, and generates the contract for it. The Archboard server does not start unless
that Codex passes its checks. A Codex on your `PATH` is not used.

`bun run build` builds the renderer core to WebAssembly and the browser
application into `dist/frontend`. Without it, the page tells you to run the
build. The server and the CLI run from the TypeScript in `apps/` and
`packages/`. If the renderer core was built from other sources than the
checkout holds, they refuse to draw and name `bun run build:core` (ADR 0057). After each `git pull`,
run `bun install` and `bun run build` again. `bun install` also links the workspace
packages into `node_modules`, and the server does not start without those links.

## 2. Put the CLI on your PATH

The entry point is `bin/archboard` in the checkout. Give it the name `archboard` on
your `PATH`, because the skill uses that name:

```bash
mkdir -p ~/.local/bin
ln -s ~/Projects/archboard/bin/archboard ~/.local/bin/archboard
```

`bin/archboard` finds its own location with `realpath`, so the link works from any
directory. If you skip this step, the skills say `archboard` where your shell
has no such command.

## 3. Set up a repository

Run the installer from the repository that you want to diagram:

```bash
cd ~/Projects/payments-api
archboard install-skill --agent claude-code
```

Use `--agent claude-code` for Claude Code. Without it, the installer sets up
Codex. The installer does these things:

1. It copies two skills into a skills directory: `archboard`, which writes
   and reads boards, and `archboard-pr`, which gives a pull request an
   architecture explainer. The default directory is `~/.agents/skills`, which
   Codex reads. With `--agent claude-code` it is `~/.claude/skills`. Each copy
   replaces an earlier copy. If a target is a symlink, the installer stops and
   changes nothing.
2. If the repository has no `.archboard/vault`, it creates that directory, with a
   `.archboard/config.yaml` file that holds the default vocabulary. The
   archboard skill explains that file to the agents that write boards.
3. It removes the block that earlier versions of the installer wrote into
   `CLAUDE.md` and `AGENTS.md` between `<!-- archboard:begin -->` and
   `<!-- archboard:end -->`. It says which files it changed and changes nothing
   else in them. Commit that change.

The repository is the nearest parent directory that holds `.git`. The installer
creates no `CLAUDE.md` or `AGENTS.md` and adds nothing to them, because a command
finds the vault from the repository (see section 4), and the file would hold
paths of your machine.

The installer prints what it did, and a JSON receipt. If Git ignores the vault,
the installer warns you. Commit the vault with your code.

These options change what the installer does:

| Option                | Effect                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| `--agent claude-code` | Install for Claude Code, in `~/.claude/skills`.                          |
| `--agent codex`       | Install for Codex, in `~/.agents/skills`. This is the default.           |
| `--target claude`     | The same as `--agent claude-code`. `--target agents` is the default.     |
| `--dir <skills-root>` | Install into `<skills-root>/archboard` and `<skills-root>/archboard-pr`. |
| `--repo <dir>`        | Set up this repository instead of the current one.                       |
| `--no-setup`          | Install the skills only. Leave the repository alone.                     |
| `--print-source`      | Show the skill directories to install, and install nothing.              |

Use one of `--agent`, `--target` and `--dir` at most.

## 4. How a command finds its vault

A vault is the `.archboard/vault` directory of one directory. A command finds
its vault the way git finds its repository. It starts in the working
directory, or in the directory that `-C <dir>` names:

- Inside a git checkout, the vault is `.archboard/vault` at the checkout root,
  from any directory in the checkout. If the root has no vault, the command
  refuses with `VAULT_NOT_FOUND` and exit code 2, and it says how to set the
  repository up. A vault above the root is never used, because it belongs to
  another repository.
- Outside any git checkout, the vault is the `.archboard/vault` of the nearest
  enclosing directory. That is an untracked vault. If there is none, the
  command refuses.
- `-C <dir>` starts the search at `<dir>` and uses the same rule, as in
  `archboard -C ~/Projects/payments-api semantic`. Put it before or after the
  command name. If `<dir>` is a vault directory, `-C` finds that vault.
  `-C` changes only where the vault is found. A relative `--input` or `--out`
  still resolves against the working directory.
- The commands that call a vault take `-C`: `semantic`, `check`, `claim`,
  `release`, `browser show`. If a command takes `-C`, the output of
  `archboard <command> --help` lists it. `start`, `stop`, `restart`, `status`, `repo`,
  `install-skill`, `browser open`, `browser panes`, `browser close` and
  `semantic replay` take none, because they need no vault.

A JSON answer of a command that takes `-C` names the vault it used, as
`vault: {path, origin}`. The origin is `-C` or `working-directory`.

The first command in a checkout or an untracked vault that this machine does
not know registers it, as `archboard repo add` does. The answer then carries
`vault.registered`, and one line goes to stderr.

A set `ARCHBOARD_VAULT` makes every command refuse with exit code 2, also when
it comes from a `.env` file. Unset it where it is set. A vault outside a
checkout moves to `<dir>/.archboard/vault`, where a command run in `<dir>` or
given `-C <dir>` finds it. The Archboard server serves only a vault in that
layout, and refuses a call that names another directory.

A vault in the repository keeps the boards next to the code. A reviewer can
then read a board change in the same diff as the code change. To diagram
several repositories together, keep their boards in a directory of their own,
for example a repository for a meta project. Run `archboard install-skill`
there, and then run commands there or give `-C <that directory>`. A binding
names a repository by its identity, so a board in that vault can describe any
repository (see "Code bindings").

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
The old variable `EXPRESS_SERVER_URL` is refused with a message, as
`ARCHBOARD_VAULT` is.

Several Archboard servers can run on one machine at the same time, each on its own port.
The Codex agents of a server run `archboard` against that server, and they
never start another server. The Codex child holds no vault setting. The
board context of a thread names the vault of each board, and the instructions
tell the thread to pass it as `-C`. The voice coordinator works in a directory
of its own under the state directory, which holds no vault, so a command it
runs without `-C` is refused. Each workhorse works in the checkout of its vault,
or in the directory that holds an untracked vault, and follows that
repository's agent instructions, skills and Codex configuration. They share one
Codex sign-in. If you sign out in one server, you sign out of all
of them. A server that is already running shows a sign-in or a sign-out from
another server only after you restart it.

Open the server URL in your browser. The conversation, the voice and video
recording need a Codex sign-in. Sign in from the agent dock, with ChatGPT or with
an OpenAI API key. The sign-in is kept apart from your own `~/.codex`, in
`codex-workbench/codex-home` in the state directory.

The server needs no vault to start, and one server serves every vault. The
navigator in the browser lists each repository that this machine knows and that
has a vault. A command that runs in a checkout makes its repository known. So
does `archboard repo add`. A page opens in the first repository, by name,
that is ready. If this machine knows no repository with a vault, the page says
so and tells you how to make one known. Each repository row has a menu of its checkouts, for
example a worktree. The checkout that you choose there is the one that the
whole machine reads, in every tab and for `archboard repo use`.

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
has no remote, the identity is the directory name of its main checkout. Every
worktree of a repository has the identity of its main checkout. Thus the main
checkout's directory names a worktree of a repository with no remote, and the
worktree's own directory does not. Archboard also knows the worktrees that `git worktree list` reports
for a checkout that you register.

One repository can have several known checkouts here: clones and worktrees.
This machine reads one of them for each repository, the chosen checkout. The first
checkout that you register is chosen. `archboard repo add` never changes the
choice, so adding a worktree does not move what the browser and the code check read.
`archboard repo use <dir>` chooses a checkout. If the checkout is unknown, the
command registers it first. `archboard repo list` shows each known checkout with
its repository. It says whether the checkout is chosen and whether its directory
exists. It also names each repository that has no chosen checkout. `archboard repo forget <dir>` removes a checkout.
If it was the chosen checkout, the repository has no chosen checkout until you
run `repo use`, and its bindings resolve as unregistered meanwhile.

An agent's `archboard browser show` from a checkout that is not chosen, such as
a worktree, makes that checkout the chosen one before it shows the board. Its
answer names the checkout that it replaced. Only `browser show`, `repo use` and
the menu in the navigator change the choice. A board command never does.
Every running server watches the registry, whichever command or server
changed it. So every pane of the repository moves to the chosen checkout with
its board, and every tab lists the change at once.

One rule overrides the choice. A binding or anchor into the repository whose
checkout holds the vault resolves in that checkout, whether or not it is
registered or chosen. So a board in a worktree is checked against that
worktree's code, while a binding into any other repository resolves in that
repository's chosen checkout. A vault outside any checkout has no repository of
its own, so all its bindings use chosen checkouts.

A directory outside any git checkout that holds `.archboard/vault` is an
untracked vault. `repo add <dir>` registers it under its base name, made unique
on this machine, and `repo list` shows it. `repo forget <dir>` removes it. A
repository without a remote is named by the directory of its main checkout. If
that name is the name of an untracked vault, the repository keeps the name. The
vault gets the next free name, and the command that registered the repository
says so.

The registry is `repos.json` in the state directory, or the file that
`ARCHBOARD_REPOS` names. A `repos.json` from an earlier version reads as it is:
each entry is a known checkout and the chosen one for its repository.

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
- rust-analyzer runs `cargo metadata`, the build scripts and the procedural macros of the Cargo workspace, and `cargo check` after it loads.

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

Python, C, C++, Objective-C, C#, Swift and Rust have no default server. To configure one, follow these steps:

1. Install the server.
2. If you did not register the checkout yet, run `archboard repo add` (see [Code bindings](#code-bindings)).
3. Run this command in the repository:

```bash
archboard repo language-server <language> <command> [--arg=<argument>]...
```

The language is `python`, `csharp`, `swift`, `c` or `rust`. The language `c` covers C, C++ and Objective-C. The command is a program on the `PATH` of the Archboard server, or the absolute path of a program. Write an argument that starts with `-` as `--arg=<argument>`.

`--repo <identity>` names another repository, and the command then configures its chosen checkout. Without it, the command configures the known checkout that holds the working directory. `--remove` removes the server of the language. `archboard repo list` shows the configured servers of each checkout. `archboard repo forget` removes them with the checkout.

The configuration stays on your machine. It is in `repos.json` with the checkout. If you register the same directory again, the configuration stays. Another checkout of the same repository has its own configuration. The check reads the configuration of the checkout it reads. That is the chosen checkout, or for the vault's own repository the checkout that holds the vault. That checkout has a configuration only if it is registered.

The Archboard server reads `repos.json` again each time that the check runs. So a running Archboard server uses a configuration that you wrote after it started. The Archboard server looks up a command that is a name on its own `PATH`. That `PATH` is the `PATH` of the command that started it. If that `PATH` lacks the command, give the absolute path of the command. Or run `archboard stop` and run a command again.

If a checkout has no configured server for a language, the check says `language-server-missing` once for the checkout and the language. If the Archboard server cannot find the configured command, the check says the same. The answer names the command that configures one, and the uses stay candidates.

The output starts with the elapsed time for each check: the board check, code facts, each language server and the history lens. JSON carries the same times in `timings`, in milliseconds. Code facts time measures file reading and parsing. Each language server time includes its startup, index, questions and cleanup, but excludes idle time between questions. The code and history checks run together, so their times overlap.

If a server does not start or stops, the check says `language-server-failed` once for that checkout. Then the check starts no other server of that language in that checkout. This includes the other Swift packages and the other C compilation databases of the checkout.

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

clangd keeps its background index in `.cache/clangd/index`. The `.cache` directory is next to `compile_commands.json`. If that file is in a `build` directory, the `.cache` directory is next to `build`. Both are inside the checkout, so add `.cache/` to the `.gitignore` of the checkout. The check waits until clangd indexed every file that the database lists. Then the answer for a definition in another file does not depend on which files the check opened first. Do not pass `--background-index=false`: the check waits for the index to finish.

On Redis (303 files in `compile_commands.json`, 24 cores, clangd 21.1.8), the first check took 4.7 seconds. Each later check took 1.9 seconds, against 0.15 seconds without clangd.

The check has no time limit. It waits for the index and the answers until they finish. Cancel the command to stop waiting. A server that exits stops its questions. LLVM took 54 seconds to index 2,283 commands in an earlier measurement.

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

#### Rust

Install rust-analyzer, for example with `rustup component add rust-analyzer rust-src` or `nix profile install nixpkgs#rust-analyzer`. rust-analyzer also needs `cargo` on the `PATH` of the Archboard server, and the source of the standard library. With rustup, the `rust-src` component gives that source. On Nix, set `RUST_SRC_PATH` in the environment of the Archboard server. This repository's `nix develop` shell gives all three. Then run `archboard repo language-server rust rust-analyzer`.

The check reads `.rs` files and each `Cargo.toml`. It starts rust-analyzer in the nearest directory above the file whose `Cargo.toml` declares a `[workspace]`, else in the directory of the nearest `Cargo.toml`. So one server answers for every member of a workspace. The check opens the file and waits until rust-analyzer ends its `rustAnalyzer/cachePriming` progress, which it begins after it loads the workspace, its build scripts and its procedural macros. Then it asks for definitions.

rust-analyzer runs `cargo check` after it loads, as it does in your editor. That writes into the `target` directory of the workspace. On this repository (24 cores, rust-analyzer 2026-10-12), the rust-analyzer part of a check took 5.7 seconds with a warm `target` directory.

If no `Cargo.toml` holds the file, the check says `language-server-unready` once. Its uses stay candidates.

## Rendering to a bitmap

`archboard semantic render <board> --out <file.svg>` writes an SVG with its
fonts in it, and needs no browser. `archboard semantic rasterize <board> --out
<file.png>` draws the same picture to a PNG in a private headless Chromium.
Both take `--variant`, `--view` and `--theme`. To export a variant
without comparison marks and removed subjects, add `--no-comparison`. To draw a
variant relative to another one, with no "Planned" frame, add `--against <variant>`.
`semantic render --theme auto` draws one SVG that shows the ground of the reader's colour
scheme. Both commands take `--title` and `--legend horizontal|vertical` to draw
a title and the key into the picture, and `--legend-only` to draw the key alone.

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

To copy the PNG and its description together on Linux or macOS, run:

```bash
archboard semantic rasterize "Skill evaluation" --clipboard
```

Archboard uses the native clipboard on the machine that runs the command.
The clipboard package installs with Archboard. No clipboard manager is required.
Archboard offers PNG and HTML together. The HTML embeds the PNG and includes
the image description as alt text. The receiving app chooses which format to paste.
On Linux, a background helper keeps the copy available after the command exits.
If another copy replaces the image or the desktop disconnects, the helper exits.
On macOS, the system keeps the copy.
The command prints a JSON receipt after the native clipboard accepts both formats.
Use either `--clipboard` or `--out` for one command.

Without either destination, `semantic rasterize` writes PNG bytes to stdout.
For an image-only clipboard entry on Wayland, run:

```bash
archboard semantic rasterize "Skill evaluation" | wl-copy --type image/png
```

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

To update archboard, run `git pull` and `bun install` in the checkout, then
run `archboard restart`. It stops the Archboard server, builds the frontend
and starts the server on the new source. `archboard status` reports a server
that runs older source. Run `archboard install-skill` again in each repository to
update its copy of the skills.

There is no uninstall command. To remove archboard, delete these things:

- The skill directories, for example `~/.agents/skills/archboard` and
  `~/.agents/skills/archboard-pr`.
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

Before starting Chromium on macOS, Archboard detects whether its own process
is inside a sandbox. If it is, Archboard refuses startup before creating a
browser process or profile. This prevents the Chromium crash dialog that a
restricted agent command can cause. The error tells the agent to request
approved execution outside the sandbox. In Codex, retry the same command with
`sandbox_permissions="require_escalated"` through the tool approval flow.
Wait for approval before retrying. This does not require `sudo`.

The guard covers rasterization, recording, and replay. SVG rendering starts
no Chromium process and needs no elevation for this restriction.

`bin/archboard` uses `realpath`, which older macOS versions do not have. If you see
`realpath: command not found`, run `brew install coreutils`, or run
`bun ~/Projects/archboard/apps/cli/src/bin.ts` directly.

Board names do not depend on case, on both Linux and macOS. If a vault has two
boards whose names differ only in case, `archboard check` reports them as
`DUPLICATE_BOARD`.
