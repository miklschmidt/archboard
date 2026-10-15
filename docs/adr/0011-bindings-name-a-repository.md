---
status: accepted
---

# A binding names a repository, and a machine-local registry says where that repository is

Amended by [ADR
0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)
(2026-10-14). The registry holds every known checkout with its identity, and one
chosen checkout for each identity. A command registers the checkout that it runs
in and says so once, and `git worktree list` adds the worktrees of a known
checkout. `repo add` does not change the chosen checkout, and `repo use` does. A
binding into the vault's own repository resolves in the vault's own checkout.
The `cwd` origin in the table below went earlier, with the command that used it.
Everything else stands.

Amended by the owner on 2026-10-15 (TASK-472.17). Every worktree of a repository
has the identity of its main checkout. With an `origin` remote, that is the
remote's host, owner and name, which all worktrees share. Without one, it is the
name of the main checkout's directory, not of the worktree's directory. Thus a
worktree of a repository with no remote is known together with its main
checkout.
A bare repository, and a repository whose git directory lives apart from its
main checkout, is named by its git directory without `.git`, because git leads
from a linked worktree only to that directory.

A binding is a logical address: a repository identity, a path inside it, and the
branch and commit at which it was last confirmed (CONTEXT.md). It must be a
logical address because boards persist in a vault that spans repositories and is
not co-located with any of them (ADR 0004). An absolute path in a note is wrong
on every other machine, and often on this machine a week later.

The note stores that logical address under `customData.archboard.binding`.
Clickable code targets are presentation. Archboard resolves the binding against
the machine-local checkout registry. Then it can add a local `file://` target, a
GitHub URL, or another affordance to an outbound copy. It strips that derived
target before it writes the note. Unrelated Excalidraw links that a human
authored are not derived from a binding. Archboard preserves them.

Until this decision, resolving a path into that address went through the working
directory of the process, as in `resolveBinding(request, cwd = process.cwd())`.
An absolute path was fine. A relative path resolved against wherever the process
happened to be. So the address depended on ambient state that the caller did not
set and had no way to see. It is the same mistake that ADR 0009 just removed
from board addressing, one level down.

The mistake failed in two different ways.

On the command line, it fails quietly. Suppose that the caller stands in
`acme/alpha` and promotes a node that means `acme/beta`. Then `src/service.ts`
binds to a real file, in a real repo, at a real commit. Everything about the
answer looks right, and the repository is the wrong one. The cross-repo case
makes this the normal case and not the unlucky one. A system board whose nodes
belong to five repositories is built in one session. There is no directory to
stand in that is right for more than one of them.

A protocol-neutral application caller can have no working directory at all. A
relative path there is not resolvable by intent, only by accident. That case
proves that an ambient process directory was the wrong interface, even though
the CLI has an explicit working-directory origin.

## The decision

A binding resolves from something that the caller named. `resolveBinding` takes
an explicit origin and has no default, so every caller must say what a relative
path can be resolved against. There are four ways, in order of how firmly the
caller named the repository. The answer always reports which one it used.

| `resolvedFrom` | The caller gave                                            | What happens                                                                                                   |
| -------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `path`         | an absolute path                                           | Archboard resolves the path, reads the identity from git, and persists it as portable repo metadata.           |
| `registry`     | a repo identity plus a path inside it                      | Archboard resolves it through the checkout registered here, then persists it as portable repo metadata.        |
| `cwd`          | a relative path, on a surface that has a working directory | Archboard resolves it, and the answer says which directory it used and which repository that turned out to be. |
| `declared`     | a repo nothing here can resolve                            | Archboard records it as stated, derives no code link, and tells the caller how to register it.                 |

On a surface with no working directory, archboard refuses a bare relative path.
The refusal names both ways out and the repositories registered on this machine.

The location of each repository on this machine is written down. ADR 0004
promised that registry, "board-to-code targets resolve through a machine-local
registry rather than living in the vault". It never built that registry.

The registry is one JSON file in the state directory. It holds one entry per
repository identity, and each entry holds the checkout path. It fills from two
sides. `repo add <dir>` records what a person declares. Observation records the
rest, because every binding that resolves through a real path records where that
repository was found. A second promotion into a repo can name it from anywhere.

The registry is host state, so the CLI maintains it through `repo list`,
`repo add`, and `repo forget`. The REST and domain modules consume it too. A
caller that cannot see the filesystem cannot sensibly name directories in it,
but it can still use a repository identity plus a repo-relative path.

## Why not one of the easier answers

One alternative requires absolute paths everywhere. This is correct as an input
resolution mode, and it is still the shortest path to a right answer. But it
makes the common in-repo case wordier than it was. It also does not survive
persistence, because an absolute path is normalized into portable repository
metadata before the note is written.

A board opened on another machine still must turn `github.com/acme/payments`
into a directory before it can offer a tappable local target. Something must
hold that map. Once the map exists, naming the repo is the better ergonomics
anyway.

Another alternative declares a repository per board, in the note's frontmatter.
This is attractive because it needs no new state and rides the identity
mechanism that boards already have. It is wrong exactly where this hurts most. A
system board spans five repositories and belongs to none of them. A per-board
default is right for the small boards that were never the problem. It is
silently wrong for the big boards that are.

A third alternative discovers checkouts by scanning the filesystem. A registry
that fills itself from `~/src/**` needs no `repo add`. It is also the ambient
working directory again with extra steps. With two clones of one repository, or
a stale worktree, the answer is a guess wearing the clothes of a lookup. Every
entry traces back to something that a person declared or something that
archboard actually resolved. Nothing else gets in.

The last alternative keeps the cwd fallback silent on the CLI. The working
directory of the shell is a real thing that the caller chose and can see, so it
stays. It must not look like an answer that the caller gave. Every time, the
result says which directory it used and which repository that was. Disclosure is
the price of keeping the convenience.

## Consequences

The decision has these consequences:

- `resolveBinding` has no default origin, so a new call site cannot silently
  reintroduce the ambient directory. Adding one is a type error until it says
  where relative paths come from.
- A promotion whose path resolved against the working directory now carries an
  extra sentence in its summary. That is intended. It is the sentence that makes
  a wrong binding visible at the moment of its creation.
- Archboard refuses a relative path from a caller with no working directory.
  Resolving it against the server process uses a directory that nobody chose.
- The registry is machine-local, so a vault carried to another machine derives
  local code targets there or not at all. That is the same trade that ADR 0004
  made by putting boards outside the repositories that they describe.
- The persisted schema is independent of the presentation target. Today the
  derived target can be a local file URL. Later it can be GitHub or another
  affordance, without any rewrite of board notes.

Amended by TASK-436.16 (2026-10-07): checkout registration is explicit through
`repo add`. The observation path described in the original decision has no
caller and is removed. Resolving a binding does not register its checkout.
Existing `repos.json` entries whose source is `observed` remain readable;
`repo list` preserves that stored source. New registrations are `declared`.
