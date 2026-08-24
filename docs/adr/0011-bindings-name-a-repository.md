---
status: accepted
---

# A binding names a repository, and where that repository is lives in a machine-local registry

A binding is a logical address: a repository identity, a path inside it, and
the branch and commit it was last confirmed at (CONTEXT.md). It has to be,
because boards persist in a vault that spans repositories and is not
co-located with any of them (ADR 0004). An absolute path in a note is wrong on
every other machine, and often on this one a week later.

The note stores that logical address under `customData.archboard.binding`.
Clickable code targets are presentation: archboard may add a local `file://`
target, a GitHub URL, or another affordance to an outbound copy after resolving
the binding against the machine-local checkout registry, but that derived
target is stripped before the note is written. Unrelated human-authored
Excalidraw links are not binding-derived and are preserved.

Until this decision, resolving a path into that address went through the
process's working directory. `resolveBinding(request, cwd = process.cwd())`.
An absolute path was fine; a relative one was resolved against wherever the
process happened to be. **So the address depended on ambient state the caller
did not set and could not see**. It is the same mistake ADR 0009 had just taken
out of board addressing, one level down.

It failed in two different registers.

On the command line it fails *quietly*. Stand in `acme/alpha`, promote a box
meaning `acme/beta`, and `src/service.ts` binds to a real file, in a real repo,
at a real commit. Everything about the answer looks right and the repository is
the wrong one. The cross-repo case makes this the normal case rather than the
unlucky one: a system board whose boxes belong to five repositories is built in
one session, and there is no directory to stand in that is right for more than
one of them.

Over MCP it fails *by construction*. That server is spawned by the client, so
its working directory is whatever directory the client was started in. A
shell-less client is exactly who MCP is for (ADR 0008), and such a client cannot
express a working directory at all. There is no argument for it, no way to
change it, no way to see it. A relative path there is not resolvable by intent,
only by accident. MCP is therefore not an edge case of the CLI's cwd handling.
It is the surface that proves an ambient directory was the wrong idea.

## The decision

**A binding resolves from something the caller named.** `resolveBinding` takes
an explicit origin and has no default, so every caller has to say what a
relative path may be resolved against. Four ways, in order of how firmly the
caller named the repository, and the answer always reports which one it used:

| `resolvedFrom` | The caller gave | What happens |
|---|---|---|
| `path` | an absolute path | resolved, the identity read from git, and persisted as portable repo metadata |
| `registry` | a repo identity plus a path inside it | resolved through the checkout registered here, then persisted as portable repo metadata |
| `cwd` | a relative path, on a surface that has a working directory | resolved, **and the answer says which directory it used and which repository that turned out to be** |
| `declared` | a repo nothing here can resolve | recorded as stated, no derived code link, and told how to register it |

On a surface with no working directory, a bare relative path is refused, and
the refusal names both ways out plus the repositories registered on this
machine.

**And where each repository actually is on this machine is written down.** ADR
0004 promised that registry, "board-to-code targets resolve through a
machine-local registry rather than living in the vault", and never built it.
It is one JSON file in the state directory, one entry per repository identity,
holding the checkout path, and it fills from two sides: `repo add <dir>` for
what a person declares, and observation, because every binding that resolves
through a real path records where that repository was found. Second promotion
into a repo can name it from anywhere.

The registry is host state, so it is maintained from the host: `repo list`,
`repo add`, `repo forget` are CLI-only. Both surfaces *consume* it, because a
repo identity plus a repo-relative path is how a shell-less client names code.
A client that cannot see the filesystem cannot sensibly name directories in it.

## Why not one of the easier answers

**Require absolute paths everywhere.** Correct as an input resolution mode, and
it is still the shortest path to a right answer. But it makes the common
in-repo case wordier than it was, and it does not survive persistence: an
absolute path is normalized into portable repository metadata before the note is
written. A board opened on another machine still needs to turn
`github.com/acme/payments` into a directory before it can offer a tappable local
target. Something has to hold that map, and once it exists, naming the repo is
the better ergonomics anyway.

**Declare a repository per board, in the note's frontmatter.** Attractive
because it needs no new state and rides the identity mechanism boards already
have. It is wrong exactly where this hurts most: a system board spans five
repositories and belongs to none of them. A per-board default would be right
for the small boards that were never the problem and silently wrong for the big
ones that are.

**Discover checkouts by scanning the filesystem.** A registry that fills itself
from `~/src/**` would need no `repo add`. It is also the ambient working
directory again with extra steps: two clones of one repository, or a stale
worktree, and the answer is a guess wearing a lookup's clothes. Every entry
traces back to something a person declared or something archboard actually
resolved, and nothing else gets in.

**Keep the cwd fallback silent on the CLI.** The shell's working directory is a
real thing the caller chose and can see, unlike MCP's, so it stays. What it may
not do is look like an answer the caller gave: the result says which directory
it used and which repository that was, every time. Disclosure is the price of
keeping the convenience.

## Consequences

- `resolveBinding` has no default origin, so a new call site cannot silently
  reintroduce the ambient directory. Adding one is a type error until it says
  where relative paths come from.
- A promotion whose path resolved against the working directory now carries an
  extra sentence in its summary. That is intended: it is the sentence that makes
  a wrong binding visible at the moment it is made.
- A relative path over MCP that used to "work" now fails. It was resolving
  against a directory nobody chose, so the ones that worked did so by luck.
- The registry is machine-local, so a vault carried to another machine derives
  local code targets there or not at all. That is the same trade ADR 0004 made
  when it put boards outside the repositories they describe.
- The persisted schema is independent of the presentation target. Today the
  derived target may be a local file URL; later it can be GitHub or another
  affordance without rewriting board notes.
