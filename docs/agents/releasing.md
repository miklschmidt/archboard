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

## How a release reaches npm

A merge of a release pull request is the release (ADR 0075). In that run of
`.github/workflows/release.yml`, release-please tags the merge commit. Then
these jobs run, each after the one before:

1. `build` checks out the tag on Linux, inside the Nix dev shell, and runs
   `bun run release`. Bun cross-compiles the macOS executable. The job keeps
   the tarballs as the `release-packages` artifact.
2. `smoke` runs `scripts/release/smoke.ts` on `ubuntu-latest` and on
   `macos-latest`, which is Apple silicon, once with npm and once with
   `bun add -g`.
3. `publish` runs in the GitHub environment `npm`. It publishes the three
   platform packages, then the two launchers, with
   `npm publish --provenance --access public`. npm trusts the job through
   trusted publishing: GitHub gives the job an OpenID Connect (OIDC) token,
   and npm accepts it in place of an npm token. A version with a `-`, such
   as `0.3.0-rc.1`, goes to the dist-tag `next`. Every other version goes to
   `latest`. A package version that is on npm already is skipped, so you can
   run a failed job again.

The MIT voice package has its own release pull request. When release-please
creates its release, `build-voice` runs `bun run pack:voice` and packs the
result, and `publish-voice` publishes it in the same way.

The repository stores no npm token.

## Set up npm once

The owner does these steps once, in this order. npm can trust a workflow only
for a package that exists already. So the first version of each package is
published by hand.

1. On npmjs.com, sign in with two-factor authentication turned on. Create the
   organization `archboard`, on the free plan for public packages. The scope
   `@archboard` belongs to it. Make sure that the unscoped name `archboard`
   is free.
2. On GitHub, open Settings, then Environments, of `miklschmidt/archboard`.
   Create the environment `npm`. Let only the branch `main` deploy to it.
3. Publish the first version of each package by hand. In a clean checkout of
   `main`, inside `nix develop`, run `bun install` and `bun run release`. Then run `npm login`, and publish the platform packages
   before the launchers:

   ```sh
   npm publish dist/release/archboard-cli-linux-x64-<version>.tgz --access public
   npm publish dist/release/archboard-cli-linux-arm64-<version>.tgz --access public
   npm publish dist/release/archboard-cli-darwin-arm64-<version>.tgz --access public
   npm publish dist/release/archboard-cli-<version>.tgz --access public
   npm publish dist/release/archboard-<version>.tgz --access public
   ```

   If `@archboard/codex-realtime-voice` is not on npm yet, run
   `bun run pack:voice` and `npm publish dist/codex-realtime-voice --access public`.
   A version published by hand has no provenance. Every later version has it.

4. For each of the six packages (`archboard`, `@archboard/cli`, the three
   `@archboard/cli-<os>-<cpu>` packages and `@archboard/codex-realtime-voice`),
   open the package on npmjs.com, then Settings, then Trusted Publisher.
   Select GitHub Actions and enter:
   - Organization or user: `miklschmidt`
   - Repository: `archboard`
   - Workflow filename: `release.yml`
   - Environment name: `npm`
5. On the same Settings page of each package, set Publishing access to
   "Require two-factor authentication and disallow tokens". After this step,
   only the release workflow can publish, and nobody can publish with a token.
6. On GitHub, make sure that the repository and the environment `npm` have no
   npm token among their secrets. Delete any that you find.

The next merge of a release pull request publishes through the workflow. If a
publish job fails with a 404 or 403 error from npm, compare the trusted
publisher of that package with step 4. Then run the failed jobs again.
