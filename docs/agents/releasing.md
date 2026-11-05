# Releasing Archboard

[ADR 0075](../adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md)
decides what a release is. This document tells you how to build the packages
of a release and how to prove that they install.

## Build the packages

Run this in a checkout, inside `nix develop`, after `bun install`:

```sh
bun run release
```

The command builds the core and the frontend first. Then
`scripts/release/build.ts` writes five packages into `dist/release`, each as a
directory and as a packed `.tgz` file:

- `archboard` and `@archboard/cli` are the launchers. Each holds only
  `bin/archboard`, a POSIX shell script (`scripts/release/launcher.sh`). The
  script finds the platform package and starts its executable. Each launcher
  lists the three platform packages as optional dependencies at its own
  version.
- `@archboard/cli-linux-x64`, `@archboard/cli-linux-arm64` and
  `@archboard/cli-darwin-arm64` are the platform packages. Each holds the
  layout of `scripts/release/compile.ts`: the executable, the frontend, the
  core, the skills and `archboard-release.json`. Its `os` and `cpu` fields let
  npm install only the matching one. It depends on the Codex binary of its
  platform under the alias that `@openai/codex` uses itself.

Every package has the version of the root `package.json`. release-please sets
that version. The Codex version comes from `CODEX_PROTOCOL_VERSION`. The build
stops when `package.json` pins another Codex.

Each package holds a `LICENSE` that names its version as the Licensed Work,
because the Change Date counts from the first publication of each version. Each
platform package also holds `THIRD_PARTY_NOTICES.md`. It covers the Bun
runtime, the code from PR Lens, the fonts, the Rust crates of the core and the
npm packages that the executable and the browser bundle are built from.

The build stops in two cases:

- A package has a `scripts` field or a `binding.gyp` file. Then an install
  would run code. A release package has no install script.
- A packed package is larger than its budget in `scripts/release/build.ts`.
  Find out what grew. Raise the budget only when the growth is intended.

## Prove that the packages install

After `bun run release`, run:

```sh
bun scripts/release/smoke.ts --installer bun --name @archboard/cli
bun scripts/release/smoke.ts --installer npm --name archboard
```

The script starts a local registry. The registry serves the tarballs in
`dist/release` and passes every other request to `registry.npmjs.org`, so the
Codex package comes from npm, as it does for a user. The script installs the
launcher into a scratch directory with `bun add -g` or `npm install --global`.
Then it runs `archboard --version`, `start`, `status` and `stop`.

The PATH of these commands holds the bin of the install and the system
directories only. The script stops when that PATH holds Bun, Node.js, npm or
Rust. The server listens on a free loopback port, and its state is in the
scratch directory. So the script never touches a server on port 3000 or 27242.

The script needs the network for the Codex package. `--installer npm` also
needs npm on your PATH.
