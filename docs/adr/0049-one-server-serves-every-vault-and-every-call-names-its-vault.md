---
status: accepted
---

# One Archboard server serves every vault, and every call names its vault

Until this decision, one Archboard server served one vault, read once at start.
The owner keeps a vault in each repository and in meta projects that plan across
repositories. So daily use needed one server for each vault, each on its own
port. A command also reached a server that held another vault without a word.

ADR 0004 and ADR 0011 assumed one vault that spans repositories and lives in
none of them. This decision replaces that assumption. It supersedes ADR 0004,
and it amends ADR 0011, ADR 0015, ADR 0020 and ADR 0021.

## Decision

A vault is the `.archboard/vault` directory of one directory. In a git checkout,
it is the vault at the checkout root, and nothing above the root counts. Outside
any checkout, it is the vault of the nearest enclosing directory that has one.
That is an untracked vault. A vault in a checkout is versioned with its
repository, so each checkout has its own copy of the vault.

One Archboard server on the machine serves every vault. The server needs no
vault to start. Every call to the server names the vault that it means. The
server has no working directory. This rule holds even on a server that serves
only one vault.

The CLI finds its vault the way git finds its repository. Every answer names the
vault that it used and how the vault was found. If no vault is found, the
command refuses. `ARCHBOARD_VAULT` is gone. If it is set, every command refuses,
so an old `.envrc` cannot quietly address another vault.

## Two addresses for one vault

At run time, the CLI, the server, the browser, a lease and the change feed must
tell two worktrees of one repository apart. So they address a vault by its
directory on this machine.

What archboard writes is committed and read on other machines. So a reference
to another vault names a repository identity, never a path. No file that
archboard writes holds a path of the machine that wrote it. An untracked vault
has no identity, so nothing in another vault can refer to it.

## The checkout registry

The checkout registry holds every checkout known on this machine, each with its
repository identity, and one chosen checkout for each identity. A command
registers the checkout that it runs in, and its answer says so. ADR 0011
rejected registration that scans the filesystem, because the answer is a guess.
Registration by a command is not a guess.

The first checkout of an identity is its chosen checkout. After that, only a
person's choice changes it, because adding a checkout must not move what every
other vault reads.

A binding that names the identity of the vault's own checkout resolves in that
checkout. A binding that names another identity resolves in the chosen checkout
of that identity. So a proposal in a worktree is checked against the worktree's
code.

## Servers that run other source

A server runs the source of the checkout that started it (ADR 0021). Inside an
archboard checkout, `archboard` runs that checkout's own `bin/archboard`. A
linked worktree of archboard uses a port that is a hash of its root path. A
command that finds a server of other source on its port refuses, names both
checkouts, and does not pick another port. All servers share one state
directory, because the registry is machine-wide on purpose.

## Considered options

If `ARCHBOARD_VAULT` stayed as an override, there are two ways to name a vault.
An exported variable is also the ambient state that ADR 0009 named.

If only `repo add` registers, the first plain `archboard` in a fresh clone or a
new worktree fails. If the server serves any named vault without a registry, a
restart loses every vault that it saw.
