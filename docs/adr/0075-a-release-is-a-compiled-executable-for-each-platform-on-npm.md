---
status: accepted
---

# A release is a compiled executable for each platform on npm

The owner decided this on 2026-11-05. This record reverses the clause of
[PRODUCT.md](../../PRODUCT.md) that says Archboard runs from a clone and is not
published on npm. It adds a second way to run Archboard to
[ADR 0014](0014-no-build-step-bun-runs-the-source.md),
[ADR 0021](0021-backend-source-changes-require-a-restart.md),
[ADR 0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)
and [ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md).
A checkout keeps every rule of those records.

## Context

To use Archboard today, a person clones the repository and installs Bun,
Node.js and the Rust tools. Then the person runs `bun install` and
`bun run build`, and links `bin/archboard` onto the `PATH`. The Rust tools build the renderer core to
WebAssembly. Most architects who use a coding agent do not have them.

Every command finds its program through `SOURCE_CHECKOUT`. That is the nearest
directory above the running file whose `package.json` is named `archboard` and
which holds `bin/archboard`. The renderer core is refused unless its recorded
hash matches the sources of that checkout. `archboard restart` rebuilds the
frontend in that checkout. The pinned Codex must lie under the checkout's
`node_modules`.

On 2026-11-05, `bun build --compile apps/cli/src/bin.ts` bundled 588 modules
into one 113 MB executable in less than a second. The executable then stopped
at `SOURCE_CHECKOUT`, because it runs from `/$bunfs/root`.

Codex publishes the native binary of each platform to npm as a version of
`@openai/codex` with a platform suffix, for example `0.160.0-linux-x64`. Its
own launcher, `bin/codex.js`, needs Node.js only to find that binary and start
it.

## Decision

### Two ways to run

A checkout runs its source with Bun, as ADR 0014 decides. A release runs one
compiled executable. Nothing else changes for a checkout.

The program decides the mode once, in one installation module. If the file
`archboard-release.json` lies beside the running executable, the mode is
release. Otherwise the checkout rule of today applies. If neither applies, the
command refuses. The module also gives the root, the version, and the
locations of the frontend, the core, the skills and the Codex binary. No other module reads `SOURCE_CHECKOUT`.

### The packages

1. `@archboard/cli` and `archboard` are one launcher, published under two
   names. Each one has the bin `archboard`, a POSIX shell script that starts
   the executable of the platform package. Each one lists the platform
   packages as optional dependencies at its own exact version. A package that
   only depends on the launcher does not put `archboard` on the `PATH`, so the
   unscoped name carries the launcher itself.
2. `@archboard/cli-linux-x64`, `@archboard/cli-linux-arm64` and
   `@archboard/cli-darwin-arm64` each hold one executable and its assets. The `os` and `cpu` fields of each one let the
   package manager install only the matching one.
3. Each platform package depends on the Codex binary of its platform at the
   exact pinned version, under the alias that `@openai/codex` uses itself, for
   example `"@openai/codex-linux-x64": "npm:@openai/codex@0.160.0-linux-x64"`.
   Archboard starts that native binary directly. It sets the two variables that
   `bin/codex.js` sets. The exact `--version` proof stays.

A release needs no Bun, Node.js, Rust, Nix or clone. Intel Macs and Windows
have no package. Under WSL 2, npm installs the Linux package. WSL 2 forwards
the loopback port to Windows, and a Windows browser resolves `*.localhost`
itself, so a release can work there. Nobody tested it.

The workspace packages stay private. The executable carries them. The MIT
voice package, `@archboard/codex-realtime-voice`, has the version of Archboard
(see Publication).

### What a platform package holds

- `bin/archboard`, the executable. It runs the CLI. With an internal first
  argument, it runs the server, so that a release never starts TypeScript.
  It embeds the tree-sitter grammars and their queries, the reviewed texts of
  the workbench and the theme colours, so that no native addon loads at run
  time.
- `frontend/`, the browser bundle that `vp build` makes.
- `core/`, the renderer glue and WebAssembly that the server loads.
- `skills/archboard` and `skills/archboard-pr`, with their generated
  references.
- `archboard-release.json`, which records the version, the commit, the core
  source hash and the Codex version.
- `LICENSE` with the version written in, and `THIRD_PARTY_NOTICES.md` for every
  bundled dependency and font.

A release ships no TypeScript language server. The code check uses the native
`tsc --lsp --stdio` of the checkout's own TypeScript 7 or later. A repository
can configure another server with `archboard repo language-server typescript`.
Without either, the code check reports the server as missing.

### What a release does differently

- The core must match the hash in `archboard-release.json`. A mismatch is
  refused with `CORE_BUILD_STALE`, and the remedy is to reinstall.
- `archboard restart` stops the server and starts it again. It builds nothing,
  because a release never changes on disk except by an install.
- A server that runs another version than the installed executable gets a
  warning that names `archboard restart`, as a stale source does in a checkout.
  `/health` reports the version and the mode.
- The server listens on `127.0.0.1:27242`. The browser address is
  `http://archboard.localhost:27242`, because Chrome and Firefox resolve every
  `*.localhost` name to the loopback address themselves. The CLI connects to
  `127.0.0.1`, because the system resolver does not resolve `*.localhost` on
  every Linux. Port 27242 spells ARCHB on a phone keypad. It is outside the
  range 10000 to 19999 of the worktree servers, and it is not port 3000 of the
  main checkout. So a release and a checkout run side by side.
- Inside an archboard checkout, a release command hands off to that
  checkout's `bin/archboard`, as ADR 0049 decides.
- `archboard install-skill` links the skills of the installation. It never
  writes into the installation, because a global install can be read-only.
- The browser loads `ui/clients/core.ts` and the painter as before. The build
  of the bundle fixes the hash that the browser checks.

### Publication

The commit messages decide each version. The repository already uses
Conventional Commits, and each pull request lands as one commit with a
conventional title. release-please (a release tool from Google) reads the
commits on `main` since the last release. It keeps one release pull request
open. That pull request bumps the version in the root `package.json` and adds
the new section of `CHANGELOG.md`. Before 1.0, a `feat` commit bumps the minor
version and a `fix` commit bumps the patch version. A breaking change bumps
the minor version.

A merge of the release pull request is the release. release-please tags the
merge commit `v<version>` and makes a GitHub release with the same notes. The
same workflow run then builds the executables for each platform on Linux. It
installs the packed tarballs on Linux and macOS without Rust, Bun or Node.js,
and runs a short smoke test. Beside the build, it runs the complete CI gate
on the tagged commit. It publishes every package only after the gate and the
smoke test pass. A tag that the workflow token makes starts no other
workflow, so publication runs in that
same workflow and not on a tag trigger.

Every package is published through npm trusted publishing. npm trusts the
release workflow of this repository through OpenID Connect (OIDC), so the
repository stores no npm token, and each package gets provenance. npm trusts
only the publish job, which runs in the GitHub environment `npm`. That
environment holds the job until the owner approves it. So release-please tags
a merged release pull request at once, but the release reaches npm only after
that approval. Each package on npm names the trusted workflow and refuses
publication by token. If npm
trusts a workflow only for a package that already exists, the owner publishes
a placeholder of each name once by hand.

The MIT voice package has no version line of its own. The Archboard
executable carries the voice package, and the voice package bundles other
workspace packages, so a change to any of them can change both. One release
pull request therefore releases both at one version, and release-please writes
that version into the voice package's `package.json` too.

The Change Date of the Business Source License counts from the first
publication of each version. The release build writes that version into the
shipped `LICENSE`.

## Consequences

- ADR 0014 named a build as the cost of running outside Bun's source. A release
  is that build. It is one immutable copy for each version, and it says its
  version, so a stale copy has a name.
- An install downloads one Codex platform package of about 427 MB. That is
  several times larger than everything that Archboard ships.
- The release build needs a build matrix of three platforms, and every file that
  the program reads by path must load from the installation module or from the
  executable.
- A checkout keeps its port, its hand-off, its source-hash refusal and its
  rebuild on restart.
