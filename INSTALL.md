# Installing archboard

You install archboard once on a machine. Then you set up each repository that you want to map.
Setup puts the model in a vault directory, `.archboard/vault`, in that repository. This guide is
also the install reference for agents: the installed skill links to it.

[Install and set up](https://usearchboard.dev/docs/install/) in the docs explains the rest: how a
command finds its vault, checkouts, each language server, pictures, recordings and machine state.
To work on archboard itself, read [TESTING.md](TESTING.md).

## What you need

- Linux on x64 or arm64, or macOS on Apple silicon. Under Windows, use WSL 2.
- Git, and npm or Bun.
- A desktop browser, to read the architecture.
- Chromium or Google Chrome, only to draw PNG files and to record videos.
- `ffmpeg` with libx264 and aac, or Nix, only to record videos.

A clone also needs Bash, Bun 1.4.4 or newer on the `PATH` of every process that runs archboard,
Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` for the build tools, and the Rust tools in step 1.

## 1. Install archboard

### Install the release

```bash
npm install --global archboard
```

With Bun, run `bun add --global archboard`. `@archboard/cli` is the same program under a second
name. The package manager installs only the build for your platform, with the Codex version that
archboard needs. The install puts `archboard` on your `PATH`, so skip step 2.

### Install from a clone

Use a clone to change archboard, or on a platform that has no release:

```bash
git clone https://github.com/miklschmidt/archboard.git ~/Projects/archboard
cd ~/Projects/archboard
```

If `nix --version` works and flakes are on, build with Nix. The shell in `flake.nix` gives Bun and
the Rust tools, but not Node.js. It does not run on an Intel Mac.

```bash
nix develop --command bash -c 'bun install && bun run build'
```

Otherwise, build with rustup. First install a C compiler and `ar` (`apt install build-essential`,
or `xcode-select --install` on macOS) and rustup from <https://rustup.rs>. Then run:

```bash
rustup toolchain install stable --profile minimal --target wasm32-unknown-unknown
rustup override set stable
cargo install wasm-bindgen-cli --locked --version "$(awk -F'"' '/^name = "wasm-bindgen"$/ { getline; print $2 }' Cargo.lock)"
bun install
bun run build
```

Keep `~/.cargo/bin` on your `PATH`, because it holds `wasm-bindgen`. If a build says that a tool is
missing, `flake.nix` lists the build tools.

`bun install` also installs the Codex version that archboard needs, inside the checkout. The server
starts only if that Codex passes its checks. A Codex on your `PATH` is not used. If `bun install`
fails while it extracts a package, run it again. `bun run build` builds the renderer core to
WebAssembly and the browser app into `dist/frontend`. If cargo is missing and `nix` is on the
`PATH`, the core build runs inside `nix develop` by itself.

## 2. Put the CLI on your PATH

A release does this for you. In a clone, link `bin/archboard` as `archboard`, because the skills
use that name:

```bash
mkdir -p ~/.local/bin
ln -s ~/Projects/archboard/bin/archboard ~/.local/bin/archboard
```

`bin/archboard` uses `realpath`. If macOS says `realpath: command not found`, run
`brew install coreutils`.

## 3. Set up a repository

Run `archboard init` in the repository that you want to map:

```bash
cd ~/Projects/payments-api
archboard init
```

`init` does these things:

1. It installs the `archboard`, `archboard-pr`, `archboard-plan` and `archboard-deepen` skills for
   your user, with the [skills CLI](https://skills.sh). Codex gets them, and Claude Code gets them
   when `claude` is on the `PATH`.
2. It makes `.archboard/vault` at the root of the checkout, if there is none.
3. It registers the checkout, so that the browser lists it.
4. It removes a block that an earlier version wrote into `CLAUDE.md` or `AGENTS.md`.
5. It starts Claude Code or Codex to set up the language servers. A language server tells the code
   check where code defines a name. The agent shows its plan and waits for your consent. Without a
   terminal, the JSON answer ends with the prompt for the agent in `next`.

Commit the vault with your code. [Set up the language
servers](https://usearchboard.dev/docs/install/#set-up-the-language-servers) says what each language
needs. Without `init`, run `npx skills add miklschmidt/archboard -g`, and an agent makes the vault
with `archboard model init` when it first works in the repository.

## 4. Start the server and sign in to Codex

Every command that needs the server starts it, unless `ARCHBOARD_NO_AUTOSTART=1` is set.
`archboard start` starts it in both cases. The server uses the environment of the command that
started it. A release server listens on <http://archboard.localhost:4242>, and the server of a
clone on <http://127.0.0.1:3000>. To use another address, set `ARCHBOARD_URL` or give `--url`.

Open the server's address in your browser. The agent dock, voice and recordings need a Codex
sign-in. Sign in from the agent dock, with ChatGPT or with an OpenAI API key. Archboard keeps this
sign-in apart from your own `~/.codex`, in the state directory.

## 5. Make sure that it works

Run these commands in the repository:

```bash
archboard status          # the server runs, and at which URL
archboard model read
archboard check semantics
```

Each command answers in JSON. To read an answer yourself, add `--text`, as in
`archboard --text model read`. A new vault holds an empty planning model. Make sure that
`archboard check code` reports no `language-server-missing` for the languages of the repository.

## 6. Run the check as a gate

Run `archboard check` where you run your compiler and your tests. It exits 0 when the model and the
code agree, and 1 while a diagnostic, a code warning or an outdated picture remains. Exit 2 means a
usage error or no vault. Exit 3 means that the server did not start.

In a pre-push hook, save this as `.githooks/pre-push`, make it executable, and run
`git config core.hooksPath .githooks` once:

```sh
#!/bin/sh
archboard check > /dev/null
```

Do not pipe the check into another command, because `archboard check | tee check.log` hides a
failure. [The gate guide](https://usearchboard.dev/docs/gate/) shows the GitHub Action, other CI
systems and an agent's loop.

## 7. Update and remove

To update a release, run the install command again, then `archboard restart`. Until the restart,
every command warns that the server runs another version.

To update a clone, run `git pull`, and make sure that Bun and Node.js still meet
[What you need](#what-you-need). With rustup, run the `cargo install` command of step 1 again. Then
run `bun install` and `archboard restart` with the build tools on your `PATH`. With Nix:

```bash
nix develop --command bash -c 'bun install && archboard restart'
```

`archboard restart` stops the server, builds the browser app and starts the server. If the build
fails, the server stays stopped. After an update, run `archboard init` again, so that the installed
skills match, or `npx skills update -g` if you installed them from GitHub.

There is no uninstall command. To remove archboard, run `archboard stop`, then delete these things:

- The skill directories, such as `~/.agents/skills/archboard`, `~/.agents/skills/archboard-pr`,
  `~/.agents/skills/archboard-plan` and `~/.agents/skills/archboard-deepen`.
- The package (`npm uninstall --global archboard`), or the `archboard` link on your `PATH`.
- [The state directory](https://usearchboard.dev/docs/install/#machine-state-and-logs). It holds
  the Codex sign-in, the registry of checkouts, the logs and the kept recordings. Vaults stay in
  their repositories, but back up the history of an untracked vault first.

## Usage telemetry

Archboard sends anonymous usage counts and error reports to its maintainers. The first command
that records prints a notice once. The CLI makes no network call for this. Each command adds one record to `telemetry/` in the state
directory. The server sends one event for each finished day, and one for each unexpected error, to
PostHog EU Cloud (`eu.i.posthog.com`). An event holds a random installation id, the operating
system, the Archboard version, counts and durations of commands by name, agent and exit code, and,
for an error, its class, code and place in Archboard's own code. An event never holds code, a
module, file, repository or model name, a path outside Archboard, a prompt, or an error message.
PostHog keeps no person profile and no location for it.

Archboard records and sends nothing in these cases:

- `CI` or another CI variable is set.
- `DO_NOT_TRACK` is set to a value that is not empty, `0` or `false`.
- `ARCHBOARD_TELEMETRY` is `0`, `false` or `off`.
- You ran `archboard telemetry off`. It also deletes the records that wait to be sent.

`archboard telemetry` shows whether it is on, and `archboard telemetry on` turns it on again. The
decision is [ADR 0079](docs/adr/0079-archboard-sends-anonymous-usage-as-wide-events.md).
