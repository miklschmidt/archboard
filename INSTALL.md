# Installing archboard for other repositories

You install archboard once on a machine. The repositories that you diagram do
not build or import it. Setup puts a vault directory, `.archboard/vault`, in a
repository. One canonical model lives in that vault.
Its manifest identifies the model and optional current state.
Module, flow, active proposal, and walkthrough files hold the authored architecture.

This document is also the installation reference for agents: the installed
skill links to it on GitHub. To set up the voice loop for development of
archboard itself, read [TESTING.md](TESTING.md).

## What you need

You install archboard in one of two ways. The npm release needs no build
tools. A clone builds archboard from its source, so that you can change it.

The release needs these things:

- Linux on x64 or arm64, or macOS on Apple silicon. Under Windows, use WSL 2.
- Git, and npm or Bun to install the package.
- A desktop browser, to read architecture. The browser layout is for desktop
  screens only.
- Chromium or Google Chrome, only to draw PNG files and to record videos.
- `ffmpeg` with libx264 and aac, or Nix, only to record videos. If there is no
  `ffmpeg`, the recorder runs `nixpkgs#ffmpeg-headless` through Nix.

A clone needs these things:

- Linux or macOS, Bash, Git, and Bun 1.4.4 or newer. Bun must be on the `PATH` of
  every process that runs archboard.
- Node.js that satisfies `^22.23.4 || ^24.22.1 || >=26.12.1`, for the Vite+ build and validation tools. These are the security releases of October 2026 and later.
- A desktop browser, to read architecture. The browser layout is for desktop
  screens only.
- The Rust tools that build the renderer core. Section 1 installs them with
  Nix or with rustup.
- Chromium or Google Chrome, only to draw PNG files and to record videos.
- `ffmpeg` with libx264 and aac, or Nix, only to record videos. If there is no
  `ffmpeg`, the recorder runs `nixpkgs#ffmpeg-headless` through Nix.

## 1. Install archboard on the machine

### Install the release

Install the package once:

```bash
npm install --global archboard
```

With Bun, run `bun add --global archboard` instead. `@archboard/cli` is the same
program under a second name. The package manager installs only the package of your platform,
with the Codex binary that archboard is pinned to. The install puts `archboard`
on your `PATH`, so skip section 2. Then set up a repository as section 3 says.

A release server listens on <http://archboard.localhost:4242>. Chrome and
Firefox send every `*.localhost` name to this machine without any setup. The
CLI connects to `127.0.0.1:4242` itself.

### Install from a clone

Use a clone to change archboard, or on a platform that has no release. Clone the
repository once:

```bash
git clone https://github.com/miklschmidt/archboard.git ~/Projects/archboard
cd ~/Projects/archboard
```

Then build it in one of the two ways below. If `nix --version` works and the
machine has flakes turned on, use Nix. Otherwise use rustup.

### Build with Nix

The shell in `flake.nix` gives Bun and the Rust tools. It does not give Node.js.
It does not run on an Intel Mac, because the pinned nixpkgs dropped
`x86_64-darwin`. On an Intel Mac, build with rustup.

```bash
nix develop --command bash -c 'bun install && bun run build'
```

### Build with rustup

Install these things first:

- A C compiler and `ar`, because a build script compiles C. On Debian or Ubuntu,
  run `apt install build-essential`. On macOS, run `xcode-select --install`.
- rustup, from <https://rustup.rs>.

Then run these commands in the checkout:

```bash
rustup toolchain install stable --profile minimal --target wasm32-unknown-unknown
rustup override set stable
cargo install wasm-bindgen-cli --locked --version "$(awk -F'"' '/^name = "wasm-bindgen"$/ { getline; print $2 }' Cargo.lock)"
bun install
bun run build
```

`rustup override set` chooses that toolchain for this checkout and leaves your
default as it is. Keep `~/.cargo/bin` on your `PATH`, because it holds
`wasm-bindgen`. That program must have the version of the `wasm-bindgen` crate in
`Cargo.lock`, so run the `cargo install` command again after each `git pull`. It
does nothing when the version is the same.

`flake.nix` is the list of the tools, if a build reports that a tool is missing.
`package.json` pins Bun, `Cargo.lock` pins wasm-bindgen, and `flake.lock` pins
Rust. The `lld` in that list is for the Rust of nixpkgs. A rustup toolchain has
its own linker. The stable toolchain can be newer than the pin: rustc 1.99.1
built the core on 2026-11-02, when the pin gave 1.99.0.

### After the build

If `bun install` fails while it extracts a package, run it again. `bun install`
also installs the Codex version that archboard is pinned to, inside the
checkout, and generates the contract for it. The Archboard server does not start unless
that Codex passes its checks. A Codex on your `PATH` is not used.

`bun run build` builds the renderer core to WebAssembly and the browser
application into `dist/frontend`. If cargo or `wasm-bindgen` does not run and `nix` is on
the `PATH`, the core build runs inside `nix develop` by itself. Without it, the page tells you to run the
build. A build needs the Rust tools only when the core's sources changed. The
server and the CLI run from the TypeScript in `apps/` and `packages/`. If the
renderer core was built from other sources than the checkout holds, they refuse
to draw and name `bun run build:core` (ADR 0059). After each `git pull`, run
`bun install` and `bun run build` again, in the way that you built it. With rustup,
run the `cargo install` command first. `bun install`
also links the workspace packages into `node_modules`, and the server does not
start without those links.

## 2. Put the CLI on your PATH

A release install does this step for you. In a clone, the entry point is
`bin/archboard` in the checkout. Give it the name `archboard` on
your `PATH`, because the skill uses that name:

```bash
mkdir -p ~/.local/bin
ln -s ~/Projects/archboard/bin/archboard ~/.local/bin/archboard
```

`bin/archboard` finds its own location with `realpath`, so the link works from any
directory. If you skip this step, the skills say `archboard` where your shell
has no such command.

## 3. Set up a repository

Run `archboard init` in the repository that you want to diagram:

```bash
cd ~/Projects/payments-api
archboard init
```

The command does these things:

1. It installs three skills of the installation with the
   [skills CLI](https://skills.sh): `archboard`, which writes and reads
   canonical models, `archboard-pr`, which gives a pull request an
   architecture explainer, and `archboard-plan`, which carries a proposal
   through the `to-spec`, `to-tickets` and `implement-spec` skills. It installs them for your user, so they work in
   every repository. Codex gets them, and Claude Code gets them when `claude`
   is on the `PATH`. A package runner starts the skills CLI. At a terminal,
   `init` asks which runner to use: `bun`, `pnpm` or `npx`, whichever the
   `PATH` has, or Skip. Without a terminal, `init` uses the first one of these
   on the `PATH`. If you skip, or if the `PATH` has none of them, `init` tells
   you the command that installs the skills later.
2. If the repository has no `.archboard/vault`, it makes the vault as
   `archboard model init` does. The model name is the name of the repository
   directory.
3. It registers the checkout, so that a browser lists it.
4. It removes the block that earlier versions wrote into `CLAUDE.md` and
   `AGENTS.md` between `<!-- archboard:begin -->` and `<!-- archboard:end -->`.
   It says which files it changed and changes nothing else in them.
5. It gives the setup of the language servers to an agent, because the right
   server and the way to install it depend on the repository. At a terminal,
   `init` asks whether Claude Code or Codex sets them up, whichever the `PATH`
   has, and starts that agent in the repository with a prompt. The agent shows
   you its plan and waits for your consent before it changes anything. If you
   skip, `init` prints the prompt.

Without a terminal, `init` assumes that an agent runs it. The JSON answer of
`init` ends with `next`, the prompt for the agent. The setup is not finished until
that agent sets up the language servers.

The repository is the nearest parent directory that holds `.git`, or the
directory that `--repo <dir>` names. `init` creates no `CLAUDE.md` or
`AGENTS.md` and adds nothing to them. A command finds the vault from the
repository (see section 4), and such a file holds paths of your machine. If Git
ignores the vault, `init` warns you. To share architecture with the source code,
commit the vault with your code.

Making a vault needs no server. Existing vaults keep their inputs. If a vault
contains legacy boards, it needs explicit migration. Setup honors the configured
Git identity and signer. If signing fails, repair that configuration before
retrying. Keep signing enabled.

The skills read the JSON Schemas of the model files from the archboard CLI on
your `PATH`, with `archboard model schema`. So the schemas always match the
installed program.

### Set up the language servers

The agent that `init` starts or prompts does these steps. You can also do them
yourself, so that `archboard check code` can resolve names to their definitions:

1. Find the languages that the repository uses.
2. For each language that has no default server, install a server. [The section
   on language servers](#language-servers-for-the-code-check) names the program
   for each language. A repository on TypeScript 7 or later needs no entry for
   TypeScript.
3. In the checkout, run `archboard repo language-server <language> <command>`
   for each of them.
4. Commit `.archboard/language-servers.json` with the vault. Then every machine
   and every CI run uses the same servers.

### Set up a repository without init

Install the skills from GitHub with the skills CLI:

```bash
npx skills add miklschmidt/archboard -g
```

The skills CLI asks which agents to install them for. `npx skills update -g`
updates them.

The first time an agent works in a Git checkout that has no `.archboard/vault`,
the agent makes the vault with `archboard model init`. You can also run it
yourself:

```bash
cd ~/Projects/payments-api
archboard model init --name payments-api --operation-id initialize-payments-api \
  --writer me --doing 'Initialize architecture'
```

The command does these things:

1. It creates `.archboard/vault` at the root of the checkout.
2. It writes `.archboard/config.yaml` into the vault, with the default vocabulary.
3. It initializes an empty canonical planning model through the signed model
   installer. The new model has no implemented current state.
4. It registers the checkout, so that a browser lists it.

Then set up the language servers as the section above says.

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
  `archboard -C ~/Projects/payments-api model read`. Put it before or after the
  command name. If `<dir>` is a vault directory, `-C` finds that vault.
  `-C` changes only where the vault is found. A relative `--input` or `--out`
  still resolves against the working directory.
- Commands that address a vault expose `-C` in their help, including `model read`, `model edit`, and `browser show`.
  Machine operations such as `status` and `repo list` need no vault.
  `model replay` reads a retained talk directory rather than mutable model inputs.

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

A vault in the repository keeps current architecture next to the code.
A reviewer can read its changes in the same diff.
To describe several repositories together, keep one model in a directory of its own,
for example a repository for a meta project. Run `archboard model init`
there, and then run commands there or give `-C <that directory>`. A binding
names a repository by its identity, so a module in that vault can describe any
repository (see "Code bindings").

Claims cover affected subjects, state, and structure scopes.
Use `model claim`, `model claims`, and `model release` through the consumer recipe.
Share authored inputs rather than machine-local runtime records.

## 5. Start the Archboard server and sign in to Codex

If the server is not running, every command that talks to it starts it. If you
do not want this, set `ARCHBOARD_NO_AUTOSTART=1`. `archboard start` starts the
server in both cases. The server uses the environment of the command that
started it.

The server of a clone listens on <http://127.0.0.1:3000>. A release server
listens on <http://archboard.localhost:4242>. To use another address, set
`ARCHBOARD_URL`, or give `--url` to one command. A command starts a server only
for a loopback address, that is, an address that only this machine can reach.
The old variable `EXPRESS_SERVER_URL` is refused with a message, as
`ARCHBOARD_VAULT` is.

Several Archboard servers can run on one machine at the same time, each on its own port.
The Codex agents of a server run `archboard` against that server, and they
never start another server. The Codex child holds no vault setting. The
captured architecture context names its actual vault, and the instructions
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
does `archboard repo add`, and so do `archboard model init` and
`archboard init`. A page opens
what its address names, or else the last reading of this browser. A machine with
one repository that holds a model opens it. Any other page shows a repository
chooser. If this machine knows no repository with a vault, the page says so and
tells you how to make one known. Each repository row has a menu of its checkouts, for
example a worktree. The checkout that you choose there is the one that the
whole machine reads, in every tab and for `archboard repo use`.

## 6. Make sure that it works

Run these commands in the repository:

```bash
archboard status          # the server runs, and at which URL
archboard model read
archboard model config
archboard check semantics
```

Each command answers in JSON, which an agent reads. To read an answer yourself,
add `--text` anywhere before a `--`, as in `archboard --text model read`. The
answer then shows the same fields as coloured text. Help prints text without it.

A new model returns an empty planning state without a current designation.
For an existing empty vault without a manifest, initialize it explicitly:

```bash
archboard model init --name Payments --operation-id initialize-payments --writer agent --doing 'Initialize architecture'
```

For a vault outside a source repository, run `model archive-init` before authoring or retention.
Follow [the consumer skill](skills/archboard/SKILL.md) for claims, proposal creation, comparison, and explicit adoption.
Use `check code --state <proposal-id>` for source evidence.
Make sure that `archboard check code` reports no `language-server-missing` for the languages of the repository.
Use `check embeds` for tracked rendered artifacts.

## 7. Run the check as a gate

Run `archboard check` where you run your compiler, your linter and your tests,
as you run `tsc` or `ruff`. It exits 0 when the model and the code agree, and 1
while a semantic diagnostic, a code warning or an outdated picture remains.
Information never fails it. Exit 2 means a usage error or no vault, and exit 3
means that the server did not start.

In a pre-push hook, save this as `.githooks/pre-push`, make it executable, and
run `git config core.hooksPath .githooks` once:

```sh
#!/bin/sh
archboard check > /dev/null
```

In GitHub Actions, the check Action installs the CLI, runs the check and puts
each finding on the diff of the pull request.
[The gate guide](https://usearchboard.dev/docs/gate/) has the workflow, pinned to a release.

In an agent's loop, give the check's output back to the agent before a person
reviews the work. This loop gives the agent three rounds:

```bash
for round in 1 2 3; do
  archboard check > /dev/null 2> check.log && break
  codex exec "archboard check failed. Fix the code or the model so that it passes. The findings: $(cat check.log)"
done
```

Do not pipe the check into another command. A pipeline exits with the status of
its last command, so `archboard check | tee check.log` hides a failure.
[The gate guide](https://usearchboard.dev/docs/gate/) covers the
Claude Code Stop hook, other CI systems and the job summary.
[Architecture on pull requests](https://usearchboard.dev/docs/pull-requests/)
covers the Action that posts the plan, the pictures before and after and the footprint.

## Application and infrastructure checkouts

A platform team often keeps Kubernetes manifests and Terraform in a repository
apart from the services. One model can bind modules into both, and one
`archboard check code` reads both. The code check follows a connection across a
network hop when the code reads an environment value by name and the
infrastructure that runs the code sets that value to another module's address.

The public relay example works this way. Its services and its model are in
[archboard-relay-example](https://github.com/miklschmidt/archboard-relay-example),
and its Kubernetes manifests and OpenTofu are in
[archboard-relay-example-infra](https://github.com/miklschmidt/archboard-relay-example-infra).
Install archboard, then run these commands:

```bash
git clone https://github.com/miklschmidt/archboard-relay-example
git clone https://github.com/miklschmidt/archboard-relay-example-infra
archboard repo add archboard-relay-example
archboard repo add archboard-relay-example-infra
cd archboard-relay-example
archboard check code
```

The check exits 0. Make Intake read `BILLING_URL` with `npm ci` and
`npm run gate:break`, and the check exits 1. Its warning names one line in each
repository:

```text
warning: RELATIONSHIP_UNDRAWN: ... The code of "Accept parcel" reaches "Rate card". No relationship joins these modules. ...
  configured-path, resolved, services/intake/src/accept.ts:51
  configured-path, resolved, deploy/kubernetes/peer-endpoints.yaml:13
```

`npm run gate:restore` takes the call out again. In CI, check out the second
repository beside the first and list its path in the check Action's `repos`
input.

Hop evidence has limits, because the check reads files and never runs the system:

- Both ends must declare the connection. The code must read the value by name,
  and the infrastructure must set that name to another module's address.
- When only one side has evidence, a drawn relationship gets the information
  `RELATIONSHIP_UNSUPPORTED`, and its `missing` field names the side without
  evidence. Information never fails the check.
- Where the infrastructure leaves a choice of target, the evidence is a
  candidate, and a finding on a candidate is information.
- The report names what it skipped, with the reason, under `skipped`. A binding
  into a repository that this machine has not registered is skipped as
  `repository-unregistered`, and a skip never fails the check. Register every
  checkout that the bindings name.
- The check never runs `terraform`, `tofu` or `kubectl`, and never reads state, a
  variable file or `.terraform`. For a remote Terraform module, pass
  `--plan` with the JSON of `tofu show -json`.

## Migrate an existing vault

If `model read` returns `LEGACY_AUTHORITY`, use [legacy migration](skills/archboard/references/legacy-migration.md).
Inventory the originals through `model inventory`.
Record deliberate identity choices through `model plan`.
Read the composed candidate through `model read --preview <origin>`.
Only owner-authorized `model migrate` installs that candidate.

The plan must preserve independent drafts, exact predecessors, historical coverage, and explicit walkthrough readings.
Matching names and bindings do not authorize identity merges.
The installer retains exact originals before removing their live copies.
Opening a model or preview never performs automatic cutover.
Retired legacy board commands cannot edit an unmigrated vault.

## Retain and share history

A checkpoint preserves exact architecture inputs and metadata in the independent Git archive.
It changes neither source HEAD nor the source index.
A checkpoint does not adopt architecture or retain source-code objects automatically.

Use [canonical history](skills/archboard/references/canonical-models.md#retain-an-exact-local-reading) before sharing or recording a reading.
Retain the complete required dependency history.
Configure an explicit remote and archive ref through `model publication-configure` before publication.
Use `model publish` to transfer that history and `model fetch` to recover unavailable checkpoints.
A normal source push does not publish the archive.
Remote retention depends on the remote owner's policy and backups.

Linked worktrees share archive objects and keep separate current architecture.
A vault outside a source repository uses explicitly initialized private history.
Back up private history before removing machine state or moving its vault.
Use `model export` and `model import` for complete portable transfer.
Canonical models have no move or ownership-transfer operation between models.

If an operation returns `RECOVERY_REQUIRED`, run `model recover` in its original checkout.
Preserve foreign bytes and the journal when recovery refuses.
For a lost response, repeat the exact request with its original operation identity.

## Code bindings

A module can bind to a file in a repository, as `binding: { repo, path }`, with an
optional `symbol`, `branch` and `commit`. The module stores the identity of the
repository and a path in the repository. It never stores an absolute path, so
the same module opens the correct file on any machine.

If a binding names a branch or a commit, the checkout must have that ref out for
the local file to open. A named commit decides over a named branch. If the
checkout is on another ref and the repository is on GitHub, the browser tells
you both refs. It also offers the file on GitHub at the named ref. Archboard never changes the
branch of your checkout. If the repository is not on GitHub, the browser opens
the local file and tells you which ref the binding names.

To open the code from a module, register each checkout on each machine:

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
a worktree, makes that checkout the chosen one before it shows the reading. Its
answer names the checkout that it replaced. Only `browser show`, `repo use` and
the menu in the navigator change the choice. An ordinary model read or edit never changes that choice.
Every running server watches the registry, whichever command or server
changed it. So every pane of the repository moves to the chosen checkout with
its reading, and every tab lists the change at once.

One rule overrides the choice. A binding or anchor into the repository whose
checkout holds the vault resolves in that checkout, whether or not it is
registered or chosen. So a model in a worktree is checked against that
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

`archboard check code` reads the checkouts that the bindings name and matches the names that the code uses. A match by name only is a _candidate_. A language server (a program that knows where code defines a name) resolves a candidate that joins two parts to its definition. It also resolves the use that an anchor names, such as `ledger.post()` through a value. Evidence that a server resolved can make a warning. A candidate never does.

A language server reads a checkout the way your editor does. For most languages, that runs code of the checkout:

- pyright runs the Python interpreter of the checkout's `.venv`, and the startup hooks of the packages in it.
- clangd runs a helper program that a compile command names for a `native` GPU. The section on C, C++ and Objective-C says more.
- csharp-ls evaluates the MSBuild files of the solution.
- sourcekit-lsp evaluates `Package.swift`.
- rust-analyzer runs `cargo metadata`, the build scripts and the procedural macros of the Cargo workspace, and `cargo check` after it loads.
- gopls runs the go command to load the packages of the workspace. The go command can download modules, and the Go toolchain that a `go.mod` names. For a package that uses cgo, it runs the C compiler.

So archboard starts such a language server only where a file names it: the `.archboard/language-servers.json` of the checkout, or the global `language-servers.json` of your machine (see [the other languages](#the-other-languages)). A repository already comes with commands to run, such as its build and its tests, so the check needs no trust step for a server that the repository names. Then the Archboard server runs the language server as your editor does. It uses the command and arguments that the file names. It uses the environment of the Archboard server, which is the environment of the command that started it (see [section 5](#5-start-the-archboard-server-and-sign-in-to-codex)). The check adds no flag, no variable and no rewritten file.

A named server runs the code of that repository. Read the `.archboard/language-servers.json` of a checkout before you run `archboard check code` on a repository that you do not trust.

### TypeScript

TypeScript has a default server. A server that a file names wins (see [the other languages](#the-other-languages)). Without one, the check reads the `typescript` package in `node_modules/typescript` at the root of the checkout. The package must be inside the checkout once its links resolve. Then the check uses the first of these that applies:

1. If the package is version 7 or later and has the native program for your machine, `@typescript/typescript-<platform>-<arch>`, beside it or inside it, the check runs `tsc --lsp --stdio`. TypeScript 7 is the first version that has a language server.
2. If the package is a TypeScript before version 7, which has no `--lsp`, the check runs `typescript-language-server --stdio`. It is the language server that wraps the `tsserver` of TypeScript. The check looks for it in `node_modules/.bin` of the checkout first, and then on the `PATH` of the Archboard server. It tells the server to run the `lib/tsserver.js` of the checkout's TypeScript. To get one, run `npm install --save-dev typescript-language-server` in the repository, or `npm install --global typescript-language-server`.
3. When you run archboard from a clone, the check runs the `tsc` of the `typescript` package that archboard installs. An archboard release ships no TypeScript, so it skips this step.

If none applies, the check says `language-server-missing` for TypeScript. The detail names the checkout's TypeScript version and the command that names a server. The check does not look in the parent directories of the checkout. In a monorepo, the check reads the root only. A package that installs another version than the root uses the version at the root.

The check names the server that it used. Each `time: language server typescript` line, and each `language-server` entry of `timings` in the JSON answer, gives the program (`program`). For a server that the check chose, it also gives the TypeScript version and whether that TypeScript is the checkout's or archboard's (`typescript`). Use it when the check and the compiler of the repository disagree.

The default server runs code of the checkout, because the checkout installed that TypeScript for its own editor. `tsc --lsp` loads no plugin that `tsconfig.json` names. This was measured with TypeScript 7.0.2. The `tsserver` of an older TypeScript loads each plugin that `tsconfig.json` names from the checkout's `node_modules`, as it does in an editor. This was measured with TypeScript 5.9.3 and typescript-language-server 6.0.3. The check turns off automatic type acquisition, so `tsserver` does not run npm to download type packages.

### The other languages

Python, C, C++, Objective-C, C#, Swift, Rust and Go have no default server. A checkout names the server of a language in its own file, `.archboard/language-servers.json`, at the root of the checkout. To name one, follow these steps:

1. Install the server.
2. Run this command in the repository. The checkout need not be registered:

```bash
archboard repo language-server <language> <command> [--arg=<argument>]...
```

3. Commit `.archboard/language-servers.json`. Then every machine and every CI run that has the checkout uses the server, with no setup of its own.

The language is `typescript`, `python`, `csharp`, `swift`, `c`, `rust` or `go`. The language `c` covers C, C++ and Objective-C. Write an argument that starts with `-` as `--arg=<argument>`. The command writes a file like this one, which you can also write by hand:

```json
{
	"rust": { "command": "scripts/rust-analyzer" },
	"python": { "command": "pyright-langserver", "args": ["--stdio"] }
}
```

The file has one key for each language. Each value has a `command` and, if the server needs any, `args`. A language or a field that this list does not name, a command that is empty, or text that is not JSON makes the whole file invalid.

Every machine and CI run that has the checkout reads the repository file, and nothing is known of their environments. So a command in the repository file is a program on the `PATH` of the Archboard server, or a path inside the checkout that starts at the checkout root. A command with a `/` that is not absolute is such a path. A path that leaves the checkout, absolute or relative, makes the file invalid. So a repository can commit a wrapper script that starts its server through its own tools, and the server then matches the repository on every machine. This repository does that for Rust: `scripts/rust-analyzer` runs the `rust-analyzer` of the flake through `nix develop`. Other repositories use a command such as `nix` with the arguments `develop --command rust-analyzer`, or the equivalent for `devenv shell` or `devbox run`.

`--repo <identity>` names another repository, and the command then writes the file of its chosen checkout. Without it, the command writes the file of the checkout that holds the working directory. `--remove` removes the language from the file, and the command deletes a file that is left with no server. A command that you type as a path is read from the working directory. The repository file keeps a path inside the checkout as a path from the checkout root, written with `/`. The command refuses a path outside the checkout. Install the server through the repository's own environment, such as its Nix flake, devenv, devbox or package manager, so that it is on the `PATH`, or commit a wrapper script. Only a program of this machine alone goes in the global file, with `--global`.

Run the command with no language to see both files. It shows the file of the checkout, the global file, and the servers that each names. The answer is JSON with `repo`, `root`, `repository` and `global`. Each of the last two has `file`, `servers` and, when the file is invalid, `problem`.

#### One server for every repository

The global file is `language-servers.json` in the state directory, beside `repos.json`. `ARCHBOARD_REPOS` moves both. It names a server for each language that the repository file leaves out. The repository file wins for each language. Write the global file with `--global`, and run it anywhere. It cannot be used with `--repo`:

```bash
archboard repo language-server c clangd --global
```

The global file belongs to this machine, so its command is a name on the `PATH` or an absolute path. It has no checkout to read a relative path from. The command stores a path that you type as an absolute path.

#### What the check does

For each language, the check uses the first of these that applies:

1. The server that the checkout's `.archboard/language-servers.json` names.
2. The server that the global `language-servers.json` names.
3. For TypeScript only, the default rule above.

If neither file names a server for another language, the check says `language-server-missing` once for the checkout and the language. The detail says that neither the checkout's `.archboard/language-servers.json` nor the global `language-servers.json` names a server, and gives the command that names one. If the Archboard server cannot find the named command, the check says the same. The uses stay candidates.

A file that the check cannot read decides every language that it could name. The check then says `language-server-missing` with the path of the file and the problem. An invalid repository file blocks every language of that checkout, TypeScript included. An invalid global file blocks each language that the repository file leaves out. `archboard repo language-server` refuses to change an invalid file and exits with 1. Fix the file or delete it, and run the command again.

A check reads the global file once, and the file of each checkout once, when it first asks about that checkout. A running Archboard server uses a file that you wrote after it started, in the next check. The Archboard server looks up a command that is a name on its own `PATH`. That `PATH` is the `PATH` of the command that started it. If that `PATH` lacks the command, commit a wrapper script that starts it through the repository's environment. For a program of this machine alone, give its absolute path in the global file. Or run `archboard stop` and run a command again.

The registry holds no servers. `archboard repo list` and `archboard repo forget` do not mention them, and a `servers` field in a `repos.json` from an earlier version is ignored. To keep a server that you configured earlier, run `archboard repo language-server` again in the checkout.

The code check's output starts with the elapsed time of each step: code facts, each language server and the history lens. JSON carries the same times in `code.timings`, in milliseconds. Code facts time measures file reading and parsing. Each language server time includes its startup, index, questions and cleanup, but excludes idle time between questions. The code and history checks run together, so their times overlap.

If a server does not start or stops, the check says `language-server-failed` once for that checkout. Then the check starts no other server of that language in that checkout. This includes the other Swift packages and the other C compilation databases of the checkout.

If a server cannot answer about a project yet, the check says `language-server-unready` once for the project. The sections below name each case.

#### Python

Install pyright or basedpyright, for example with `npm install -g pyright` or `pipx install basedpyright`. Then name it with `archboard repo language-server python pyright-langserver --arg=--stdio`. For basedpyright, run `archboard repo language-server python basedpyright-langserver --arg=--stdio`.

pyright reads `pyrightconfig.json`, or `[tool.pyright]` in the `pyproject.toml`, at the root of the checkout. The check tells pyright the interpreter of a virtual environment in `.venv` or `venv` at the root, as the Python extension of an editor does. Then imports of installed packages resolve. That interpreter runs, and so do the startup hooks of the packages that are installed in it.

A virtual environment outside the checkout, such as one that Poetry or Hatch keeps elsewhere, needs a `venvPath` and a `venv` in the pyright configuration. Without them, pyright uses the `python3` on the `PATH` of the Archboard server.

#### C, C++ and Objective-C

Install clangd, for example with `apt install clangd`, `brew install llvm` or `nix profile install nixpkgs#clang-tools`. Then name it with `archboard repo language-server c clangd`. The check reads `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hh`, `.hpp`, `.hxx` and `.m` files. It reads `.mm` files only as text.

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

Install csharp-ls with `dotnet tool install --global csharp-ls`. Then name it with `archboard repo language-server csharp csharp-ls`. csharp-ls needs the .NET SDK that it was built for on the `PATH` of the Archboard server. csharp-ls 0.28 needs .NET 10.

The check tells csharp-ls to load the `.sln` or `.slnx` file that is nearest the root of the checkout. With no solution, csharp-ls loads every `.csproj` file. The check never asks it to build or to restore packages.

But csharp-ls runs the MSBuild targets of a project up to the compiler, to load the project. So a target that the project hooks there runs, such as an `Exec`. It also writes files under the `obj` directory of each project. If a project names an MSBuild SDK with a version, such as `Microsoft.Build.NoTargets/3.7.56`, MSBuild downloads that SDK from NuGet.

If Git lists no `.sln`, `.slnx` or `.csproj` file in the checkout, the check starts no server. It says `language-server-unready` once for the checkout.

The Roslyn language server is not supported. It loads nothing until the client opens a solution with a message of its own, and by default it restores packages from the network. If a file names it, it answers nothing, and the uses stay candidates. This was measured with csharp-ls 0.28.0 and roslyn-ls 5.11.0.

#### Swift

Name it with `archboard repo language-server swift sourcekit-lsp`. sourcekit-lsp evaluates `Package.swift`, which runs code of the checkout.

sourcekit-lsp builds a package itself on the first run to prepare its background index. Background indexing is on by default in Swift 6.1 and later. The check passes no option that changes it, and a package can set its own options in `.sourcekit-lsp/config.json`.

The check starts sourcekit-lsp in the package that holds the file. It waits for `workspace/synchronize` with `index: true` to finish the build graph and index before it asks for definitions. The server keeps its index database and a module cache under `.build`, as it does in your editor. A first check can take longer than a later check because the server prepares the package.

If no `Package.swift` holds the file, the check says `language-server-unready` once. Its uses stay candidates.

#### Rust

Install rust-analyzer, for example with `rustup component add rust-analyzer rust-src` or `nix profile install nixpkgs#rust-analyzer`. rust-analyzer also needs `cargo` on the `PATH` of the Archboard server, and the source of the standard library. With rustup, the `rust-src` component gives that source. On Nix, set `RUST_SRC_PATH` in the environment of the Archboard server. This repository's `nix develop` shell gives all three. Then name it with `archboard repo language-server rust rust-analyzer`.

The check reads `.rs` files and each `Cargo.toml`. It starts rust-analyzer in the nearest directory above the file whose `Cargo.toml` declares a `[workspace]`, else in the directory of the nearest `Cargo.toml`. So one server answers for every member of a workspace. The check opens the file and waits until rust-analyzer ends its `rustAnalyzer/cachePriming` progress, which it begins after it loads the workspace, its build scripts and its procedural macros. Then it asks for definitions.

rust-analyzer runs `cargo check` after it loads, as it does in your editor. That writes into the `target` directory of the workspace. On this repository (24 cores, rust-analyzer 2026-10-12), the rust-analyzer part of a check took 5.7 seconds with a warm `target` directory.

If no `Cargo.toml` holds the file, the check says `language-server-unready` once. Its uses stay candidates.

#### Go

Install gopls, for example with `go install golang.org/x/tools/gopls@latest` or `nix profile install nixpkgs#gopls`. gopls also needs the `go` command on the `PATH` of the Archboard server. This repository's `nix develop` shell gives both. Then name it with `archboard repo language-server go gopls`.

The check reads `.go` files and each `go.mod`. A Go package is the `.go` files directly in one directory. An import path leads to a package through the module path that a `go.mod` of the checkout declares, so the modules of a `go.work` and a local `replace` resolve too. The check starts gopls in the nearest directory above the file that holds a `go.work`, else in the directory of the nearest `go.mod`. So one server answers for every module of a workspace. The check opens the file and asks for definitions. gopls answers after it loads the packages of the workspace.

The syntax reading has limits. A name that two files of a package define, as files with other build constraints can, leads nowhere. The names that a dot import brings in lead nowhere. A method called through a value, such as `book.Post()`, needs gopls.

If no `go.mod` holds the file, the check says `language-server-unready` once. Its uses stay candidates.

## Rendering to a bitmap

Use canonical selectors for both exports:

```bash
archboard model render --module Gateway --theme auto --out gateway.svg
archboard model rasterize --module Gateway --out gateway.png
archboard model render --flow Checkout --grammar sequence --checkpoint <checkpoint-id> --out checkout.svg
```

`model render` writes a self-contained SVG without Chromium.
`model rasterize` captures the same local projection through private headless Chromium.
Both accept state, checkpoint, scope, focus, grammar, flow, and filter selectors.
Sequence and flowchart require an explicit authored flow and preserve its complete exchange.
Use each command's `--help` for its supported flags.

Exports record model identity, canonical selectors, input revision, and picture digest in their render recipes.
Keep SVG `<metadata>` when another tool processes the file.
Git discovers tracked artifacts for `check embeds`.
Use `check embeds --fix` only when artifact replacement is authorized.
A model keeps no second list of exported pictures.

The rasterizer finds Chromium or Google Chrome on `PATH` or in standard macOS applications.
Set `ARCHBOARD_RENDERER_CHROMIUM` to use another executable.
The command removes its private profile before completion.
Without a browser, it refuses and writes no PNG.

`--scale` accepts 0.25 to 4 bitmap pixels per diagram pixel.
`--region x,y,w,h` selects a region inside the page.
Rasterization refuses images larger than 16384 pixels per side or 80 million pixels.
The receipt records dimensions, exact canonical revision, and SVG digest.
The canonical command requires `--out` and exposes no clipboard flag.

## Recording a walkthrough

Retain an exact checkpoint before recording a walkthrough:

```bash
archboard model record --checkpoint <checkpoint-id> --walkthrough 'Request tour' --out tour.mp4
```

Use [canonical walkthroughs](skills/archboard/references/canonical-walkthroughs.md) to author complete reading instructions for every beat.
The recording pins one model revision for the whole presentation.
Missing subjects or history stop playback instead of selecting another state.
`--language` selects a BCP 47 language tag, such as `da`, `fr`, or `pt-BR`.
Recording never deletes the model.

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
`archboard model replay <talk> --out <file.mp4>` renders a kept talk again,
with no voice session. Use `--theme dark` for the other palette, or render
again after you update archboard. The live model need not exist. If a render fails,
the command refuses with `RENDER_FAILED`, keeps the talk and names the
`model replay` command that renders it again.

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

To update a release, run the install command again, for example
`npm install --global archboard`. Then run `archboard restart`, so that the
server runs the new version. Until then, every command warns that the server
runs another version. A release restart builds nothing.

To update a clone, run `git pull` in the checkout. Make sure that `bun --version`
and `node --version` still satisfy [What you need](#what-you-need), because nothing
refuses an older one. Then run `bun install` and
`archboard restart` with the Rust tools on your `PATH`, because the restart builds
the renderer core when its sources changed. With Nix, run this command:

```bash
nix develop --command bash -c 'bun install && archboard restart'
```

With rustup, run these commands in the checkout:

```bash
cargo install wasm-bindgen-cli --locked --version "$(awk -F'"' '/^name = "wasm-bindgen"$/ { getline; print $2 }' Cargo.lock)"
bun install
archboard restart
```

`archboard restart` stops the Archboard server, builds the frontend and starts
the server on the new source. If the build fails, the server stays stopped.
`archboard status` reports a server that runs older source.

The skills CLI installs copies of the skills. If `archboard init` installed
them, run `archboard init` again after an update, so that they match the new
version. If you installed them from GitHub, run `npx skills update -g`.

There is no uninstall command. To remove archboard, delete these things:

- The skill directories, for example `~/.agents/skills/archboard`,
  `~/.agents/skills/archboard-pr` and `~/.agents/skills/archboard-plan`.
- The `archboard` link on your `PATH`, or the package of a release, for example
  with `npm uninstall --global archboard`.
- The state directory. It holds the Codex sign-in, `repos.json`, the global
  `language-servers.json`, the opener configuration, the server process files, the log and the kept talks of recordings.

Keep the vault and its archive until you no longer need their architecture or recovery evidence.

## Machine state and logs

Archboard keeps its machine state apart from the vault, because the vault can
move between machines. The state directory and the log are in these places:

| System | State directory                                                    | Log                                    |
| ------ | ------------------------------------------------------------------ | -------------------------------------- |
| Linux  | `$XDG_STATE_HOME/archboard`, by default `~/.local/state/archboard` | `archboard.log` in the state directory |
| macOS  | `~/Library/Application Support/archboard`                          | `~/Library/Logs/archboard.log`         |

`LOG_FILE_PATH` sets another log file.

## Usage telemetry

Archboard sends anonymous usage counts and error reports to its maintainers, so that they can
see which commands, agents and features people use, and where Archboard fails. The first
command that records prints a notice once.

The CLI never makes a network call for this. Each command appends one record to `telemetry/` in
the state directory. The Archboard server sends one `daily usage` event for each finished day,
and one event for each unexpected error, to PostHog EU Cloud (`eu.i.posthog.com`). An event holds:

- a random installation id, and the operating system and architecture,
- the Archboard version, and whether it runs from a release or a checkout,
- the counts of commands by name, by agent and by exit code, and their durations,
- the agent that ran a command, such as `claude` or `codex`, and whether Archboard's workbench ran it,
- for an error, its class, its code, and the files and lines of Archboard's own code where it happened.

An event never holds code, a module, file, repository or model name, a path outside Archboard,
a prompt, or the text of an error message. PostHog keeps no person profile and no location for
it.

Archboard records and sends nothing in these cases:

- `CI` is not empty, or another CI variable is set. The GitHub Actions of Archboard never send.
- `DO_NOT_TRACK` is set to a value that is not empty, `0` or `false`, in any case.
- `ARCHBOARD_TELEMETRY` is `0`, `false` or `off`.
- You ran `archboard telemetry off`. It also deletes every record that waits to be sent.

Run `archboard telemetry` to see whether it is on, and why it is off. Run `archboard telemetry
on` to turn it on again. The decision is [ADR 0079](docs/adr/0079-archboard-sends-anonymous-usage-as-wide-events.md).

## Notes for macOS

On macOS, archboard examines processes through the macOS process API. On Linux
it uses `/proc`.

The browser that `model rasterize` and `model record` start uses the
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

Model subjects use stable qualified identities.
If a name resolves ambiguously, use one of the returned identities.
A file rename or changed display name never creates another subject.
