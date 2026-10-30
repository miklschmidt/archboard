---
status: accepted
---

# One Archboard server serves every vault, and every call names its vault

Decided with the owner on 2026-10-14. The migration is planned in the Backlog
document doc-002, "One Archboard server for every vault".

Amended by TASK-526.01 (2026-10-24): the code check is `archboard check code`,
also run by `archboard check` and `archboard check all`.
[ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md)
decides the split.

Until this decision, one Archboard server served one vault. When it started, it
read the vault from `ARCHBOARD_VAULT` once. The owner keeps the boards of
several repositories in each repository's `.archboard/vault`, and keeps meta
projects that plan across those repositories. So daily use needed one server for
each vault, each on its own port. A command also reached a server that held
another vault without a word, because nothing compared the two vaults.

ADR 0004 and ADR 0011 assumed one vault that spans repositories and lives in
none of them. That assumption no longer holds, and this decision replaces it.

## Decision

A vault is the `.archboard/vault` directory of one directory. In a git checkout,
it is the vault at the checkout root, and nothing above the root counts. Outside
any checkout, it is the vault of the nearest enclosing directory that has one.
That is an untracked vault. A vault in a checkout is versioned with its
repository. So each checkout has its own copy of the vault, as it has its own
copy of the code. A meta project is a repository like any other. A vault's
boards can still describe any repository, because a binding names a repository
identity (ADR 0011).

One Archboard server on the machine serves every vault. The first command that
finds no server starts it, and the server needs no vault to start. Every call
to the server names the vault that it means. The server has no working
directory, and ADR 0020 gives the board axis no default. This rule holds even on
a server that serves only one vault.

The CLI finds its vault the way git finds its repository. It starts from the
working directory, or from the directory that `-C <dir>` names. Every answer
names the vault that it used and how the vault was found. If no vault is found,
the command refuses, as it does today. `ARCHBOARD_VAULT` is gone. If it is
set, every command refuses and says how a vault is found now. Thus an old
`.envrc` or `.env` cannot quietly address another vault. `./bin/dogfood` is gone
too: `archboard` in the archboard checkout reads archboard's own boards.

## Two addresses for one vault

A vault has a runtime address and a persisted address.

At run time, the CLI, the server, the browser, a lease and the change feed must
tell two worktrees of one repository apart. So they address a vault by its
directory on this machine.

In a note, a reference to a board of another vault names a repository
identity, never a path. A note is committed and is read on other machines.
No file that archboard writes can hold a path of the machine that wrote it. The
only such reference is a drill-down. A drill-down can name a repository
identity, and without one it stays in its own vault. An untracked vault has no
identity, so no board in another vault can drill down into it.

## The checkout registry

The checkout registry holds every checkout known on this machine, each with its
repository identity. It also holds every untracked vault, with a name that the
browser shows. For each identity it records one chosen checkout. A checkout
becomes known in three ways. A person runs `repo add`. A command runs in the
checkout, and its answer says once that it registered the checkout. Or a known
checkout lists it in `git worktree list`. A checkout whose directory is gone
stays in `repo list` as gone until `repo forget` removes it.

The first checkout of an identity is its chosen checkout. After that, only a
person's choice changes it: `repo use`, the navigator's menu (ADR 0050), and
`browser show` from another checkout (ADR 0050). `repo add` never changes the
choice, because adding a checkout must not move what every other vault reads.

ADR 0011 rejected registration that scans the filesystem, because the answer is
a guess. Registration by a command is not a guess. Somebody ran a command in
that checkout, and the answer says so.

## Where a binding resolves

A binding or anchor that names the identity of the vault's own checkout
resolves in that checkout. A binding that names another identity resolves in
the chosen checkout of that identity. So a proposal in a worktree is checked
against the worktree's code, and a meta project is checked against the
checkouts that this machine reads. `check code` and `behind` read the one
vault that the command addresses.

## Servers that run other source

A server runs the source of the checkout that started it (ADR 0021). Inside an
archboard checkout, `archboard` runs that checkout's own `bin/archboard`. The
main archboard checkout uses port 3000. A linked worktree of archboard uses a
port that is a hash of its root path into the range 10000 to 19999. The path
stays the same for the life of a worktree, but a branch inside it can change.
When `ARCHBOARD_URL` or `--url` is set, it still decides. `/health` reports
the source checkout of the server. A command that finds a server of other source
on its port refuses, names both checkouts, and does not pick another port. All
servers share one state directory, because pid files and Codex ledgers are
already kept per port, and the registry is machine-wide on purpose.

Tests and the skill evaluations keep their own servers, ports and state
directories. They make their vaults in the `<dir>/.archboard/vault` layout.

## Considered options

If `ARCHBOARD_VAULT` stayed as an override, there are two ways to name a vault.
An exported variable is also the ambient state that ADR 0009 named. `-C` covers
the untracked case once an untracked vault uses the same layout.

If only `repo add` registers, the first plain `archboard` in a fresh clone or a
new worktree fails. If the server serves any named vault without a registry, it
lists only the vaults that it saw since it started. A restart then loses them.

If a repository identity is the only address, two worktrees of one repository
cannot be told apart. If a path is the only address, committed notes hold paths
of one machine.

## Consequences

- ADR 0004 is superseded. Its logical code references stay, through ADR 0011.
- ADR 0011 is amended. The registry holds every known checkout and a chosen
  checkout for each identity. A command registers the checkout that it runs
  in. The `cwd` origin of its table went earlier, with the command that used
  it. A semantic board states every binding as a repository and a path.
- ADR 0015 is amended. The server starts without a vault, and the CLI refuses
  when it finds none.
- ADR 0020 is amended. "The configured vault" becomes the vault that the call
  names.
- ADR 0021 is amended. A worktree of archboard runs its own server on its own
  port.
- The vault mismatch guard of TASK-471.01 has no purpose, and that task is
  superseded.
- The owner considers a hosted Archboard. It keeps boards in a database and
  gives each board a repository link as metadata. A local board stores no
  repository field. Its repository is the identity of the checkout that holds
  it. A hosted design adds the field.
