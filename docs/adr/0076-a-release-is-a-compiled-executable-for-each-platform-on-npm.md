---
status: accepted
---

# A release is a compiled executable for each platform on npm

This record reverses the clause of [PRODUCT.md](../../PRODUCT.md) that says
Archboard runs from a clone and is not published on npm. It adds a second way to
run Archboard to [ADR 0014](0014-no-build-step-bun-runs-the-source.md),
[ADR 0021](0021-backend-source-changes-require-a-restart.md),
[ADR 0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)
and [ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md).
A checkout keeps every rule of those records.

## Context

To run Archboard from a clone, a person installs Bun, Node.js and the Rust
tools. The Rust tools build the renderer core to WebAssembly. Most architects
who use a coding agent do not have them.

Every command found its program through the source checkout. So a compiled
executable, which runs from a virtual file system, stopped at once.

## Decision

A checkout runs its source with Bun, as ADR 0014 decides. A release runs one
compiled executable.

The program decides the mode once, in one installation module. If
`archboard-release.json` lies beside the running executable, the mode is
release. Otherwise the checkout rule applies. If neither applies, the command
refuses. Every file that the program reads by path loads from that module or
from the executable. No other module looks for the source checkout.

`@archboard/cli` and `archboard` are one launcher, published under two names.
The launcher lists one package for each platform as optional dependencies at its
own exact version, and the `os` and `cpu` fields let the package manager install
only the matching one. A package that only depends on the launcher does not put
`archboard` on the `PATH`, so the unscoped name carries the launcher itself.

Each platform package depends on the native Codex binary that Codex publishes
for its platform, at the exact pinned version. Archboard starts that binary
directly, so a release needs no Bun, Node.js, Rust, Nix or clone. Intel Macs and
Windows have no package.

The executable runs both the CLI and the server, so a release never starts
TypeScript. A release ships no TypeScript language server. The code check uses
the one in the checked repository, or one that the repository configures.

A release never changes on disk except by an install, so `archboard restart`
builds nothing. The release server uses a fixed port outside the ports of
checkouts and worktrees, so a release and a checkout run side by side. Inside an
archboard checkout, a release command hands off to that checkout's
`bin/archboard`, as ADR 0049 decides.

`archboard init` runs the skills CLI on the skills directory of the
installation, so the skills CLI decides where each agent reads its skills.
`init` never writes into the installation.

### Publication

[docs/agents/releasing.md](../agents/releasing.md) gives the procedure.
release-please derives each version from the Conventional Commits on `main`. A
merge of its release pull request is the release. A tag that the workflow token
makes starts no other workflow, so the same workflow run builds, tests and
publishes, and not a tag trigger.

Every package is published through npm trusted publishing. The repository
stores no npm token, and each package refuses publication by token.

The MIT voice package has no version line of its own. The executable carries
it, and it bundles other workspace packages, so one release releases both at one
version.

The Change Date of the Business Source License counts from the first
publication of each version. The release build writes that version into the
shipped `LICENSE`.

## Consequences

- An install downloads one Codex platform package of about 427 MB. That is
  several times larger than everything that Archboard ships.
