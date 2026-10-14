---
id: doc-002
title: One Archboard server for every vault
type: specification
created_date: '2026-10-14 21:42'
updated_date: '2026-10-14 21:42'
tags:
  - migration
  - ready-for-agent
---
# One Archboard server for every vault

Decided with the owner on 2026-10-14. The decisions are in ADR 0049, ADR 0050
and ADR 0051, and the terms are in CONTEXT.md. This specification is the input
for the Backlog tasks of the migration. Each task carries a proposal on the
boards that it changes, as the archboard-dev skill requires.

## Problem Statement

The owner keeps the boards of several repositories in each repository's
`.archboard/vault`, and keeps meta projects that plan the architecture across
those repositories. One Archboard server serves one vault. When it starts, it reads that vault
from `ARCHBOARD_VAULT`. So several repositories need several servers
on several ports, and the owner must start, stop and remember each one.

A command can also reach a server that holds another vault, and nothing
compares the two vaults. Thus a command in one repository can read or write the
boards of another repository without a word.

Plain `archboard` does not work in a set-up repository unless somebody exports
`ARCHBOARD_VAULT`. The setup block that `install-skill` writes holds absolute
paths of the machine that ran it. A drill-down names only a board in its own vault.
So a board of a meta project cannot drill down into a product repository. Archboard's own worktrees each need their own server, and
`./bin/dogfood` exists only to choose archboard's vault.

## Solution

One Archboard server on the machine serves every vault. The CLI finds its vault
from the directory that it runs in, as git finds its repository. In a checkout,
the vault is `<checkout root>/.archboard/vault`. Outside a checkout, it is the
nearest enclosing `<dir>/.archboard/vault`, an untracked vault. `-C <dir>` names
another directory. Every answer names the vault that it used and how it found
it. `ARCHBOARD_VAULT` and `./bin/dogfood` are removed.

The browser is one app. Its navigator lists every repository that has a vault
and every untracked vault, each with its boards. The two panes of a tab can show
two repositories, and a drill-down can open a board of another repository in
the same pane. A menu on each repository chooses which of its checkouts this
machine reads, for example the main checkout or a worktree.

The Codex workbench has one voice coordinator for the whole app and one
workhorse for each checkout. Each workhorse runs in its checkout, so it reads
that repository's agent instructions and skills. The agent dock shows the
conversation of the checkout that the user last activated.

A person can move a board to another repository in the browser, and
`archboard semantic move` does the same on the command line.

## User Stories

### Finding the vault

1. As an agent, I want plain `archboard` to work in a checkout that has `.archboard/vault`, with nothing exported, so that a set-up repository needs no shell setup.
2. As an agent, I want every answer to name the vault that it used and how it found it, so that I see at once when I address the wrong vault.
3. As an agent, I want `-C <dir>` to address the vault of another directory, so that I can work on a product repository's boards from a meta project without `cd`.
4. As an architect, I want a vault outside any git checkout, at `<dir>/.archboard/vault`, so that I can keep boards that belong to no repository.
5. As an agent in a subdirectory of a checkout, I want the checkout root's vault, so that the directory that I stand in does not change which vault I write.
6. As an agent in a checkout with no vault, I want a refusal that says how to set up the repository, so that I never write into the vault of a directory above the checkout.
7. As an agent outside any checkout and any vault, I want a refusal that says how a vault is found, so that I know what to do next.
8. As an architect with an old `.envrc` or `.env` that sets `ARCHBOARD_VAULT`, I want every command to refuse and say what replaced it, so that an old setup never quietly addresses another vault.
9. As an architect, I want `./bin/dogfood` gone and `archboard` in the archboard checkout to read archboard's own boards, so that there is one way to reach them.

### One server

10. As an architect, I want one server for every vault on my machine, so that I start, stop and open only one thing.
11. As an agent, I want the first command that finds no server to start it, even before any vault is chosen, so that I never start a server by hand.
12. As a caller of the server API, I want every board call to name its vault, so that no call resolves against a default that I cannot see.
13. As an architect, I want a claim, a doing line and a board announcement to reach only the panes that show that board in that vault, so that two boards with one name in two vaults never mix.
14. As an agent, I want a lease in one vault to be independent of a lease in another, so that work in one repository never blocks another.

### The checkout registry

15. As an agent, I want the first command in a new checkout to register it and say so once, so that a fresh clone or worktree works without `repo add`.
16. As an architect, I want the worktrees of a known checkout to be known too, so that I can choose one without registering it by hand.
17. As an architect, I want `repo add <dir>` to register a checkout without changing which checkout this machine reads for its repository, so that adding a clone changes nothing that I read.
18. As an architect, I want `repo use <dir>` to choose the checkout that this machine reads for its repository, so that I decide which copy the app shows.
19. As an architect, I want `repo list` to show every known checkout, each with its repository, whether it is chosen and whether it still exists, so that I can see the state of the registry.
20. As an architect, I want `repo forget` to remove a checkout or an untracked vault, so that a deleted worktree leaves nothing behind.
21. As an architect with a `repos.json` from an earlier version, I want it to keep working, so that the migration needs no manual step.
22. As an architect, I want every untracked vault to get a readable name in the registry, so that the browser and its URL can name it without a path.

### Bindings and the code check

23. As an agent in a worktree, I want the code check of a proposal to read the worktree's code, so that a branch is checked against its own changes.
24. As an architect of a meta project, I want bindings into other repositories to resolve in their chosen checkouts, so that the code check and "open the code" use the copies that I chose.
25. As an architect, I want "open the code" on a worktree's board to open the worktree's file, so that I read the code that the board describes.
26. As an agent, I want `check --code` and `behind` to read only the vault that the command addresses, so that the answer stays about the boards that I work on.
27. As an agent, I want a binding into a repository with no known checkout to be listed as unregistered, as today, so that a missing checkout is visible and never an error.

### Drill-down across repositories

28. As an agent, I want a drill-down that names a repository identity, so that a meta project's board can open a product repository's board.
29. As an agent, I want a drill-down without a repository identity to stay in its own vault, so that every existing drill-down keeps its meaning.
30. As an agent, I want `archboard check` to report a drill-down into a repository identity that has no board of that name in its chosen checkout, so that a broken link is found.
31. As an agent, I want a refusal when I try to make a drill-down into an untracked vault from another vault, so that no note holds a path.
32. As an architect, I want a drill-down into another repository to dive in its pane like any other drill-down, so that one system reads as one app.
33. As an architect, I want the breadcrumb to lead back across repositories, so that I can return to where I started.
34. As an architect, I want a drill-down into a repository that this machine does not know to say that the repository is not registered and how to register it, so that I know why nothing opened.

### The navigator

35. As an architect, I want the navigator to list every repository that has a vault and every untracked vault, so that I can reach every board on my machine from one place.
36. As an architect, I want each repository to list the boards of its chosen checkout, grouped under it, so that two boards with one name in two repositories never collide.
37. As an architect, I want a menu on each repository that lists its known checkouts and chooses one, so that I can read a worktree's boards.
38. As an architect, I want a repository row that says when its chosen checkout has no vault or is gone, so that an empty list is explained.
39. As an architect, I want every tab to follow a change of chosen checkout, so that two tabs never show two copies of one repository without my knowing.
40. As an architect, I want a pane that shows a board of a repository whose chosen checkout changed to read the board again from the new checkout, so that what I see is what this machine reads.
41. As an architect, I want a pane whose board is not in the new checkout to say so, so that a missing board is never a blank pane.
42. As an architect, I want the URL of a tab to name each pane's repository and never a path, so that a URL holds nothing of my file system.
43. As an architect, I want the two panes of one tab to show boards of two repositories, so that I can read a meta board beside a product board.
44. As an architect, I want the navigator and its menus to work from the keyboard, so that the shell stays accessible.

### Agents and the browser

45. As an agent in a worktree, I want `browser show` to make my checkout the chosen one when it is not, so that the user sees the board that I work on.
46. As an agent, I want the answer of `browser show` to say when it changed the chosen checkout and which checkout it replaced, so that I can tell the user.
47. As an architect, I want only `browser show`, `repo use` and the navigator's menu to change the chosen checkout, so that a board command never moves what I read.
48. As an agent, I want `browser panes` to report every pane with its repository and checkout, and whether it shows my own checkout, so that I know what is on the user's screen.

### The Codex workbench

49. As an architect, I want each checkout's workhorse to run in that checkout, so that it reads that repository's agent instructions, skills and Codex configuration.
50. As an architect, I want the workhorse of an untracked vault to run in the directory that holds the vault, so that it has a working directory of its own.
51. As an architect, I want one voice coordinator for the whole app, so that voice works across every repository on screen.
52. As an architect, I want the coordinator to give work in a checkout to that checkout's workhorse and to start the workhorse when there is none, so that I never manage threads by hand.
53. As an architect, I want the dock to show the conversation of the checkout that I last activated by focus, by the navigator or by a drill-down, so that the conversation follows my attention.
54. As an architect, I want an agent's `browser show` never to switch the shown conversation, so that it does not change while I type.
55. As an architect, I want a list of the live workhorses of my tab in the dock, named by repository and checkout, so that I can switch between them.
56. As an architect, I want the list to mark a workhorse that waits for an approval or for me, so that nothing waits unseen.
57. As an architect, I want a typed message to go to the shown workhorse, and to start one if the checkout has none, so that typing always reaches the repository on screen.
58. As an architect, I want New conversation to replace the shown checkout's workhorse only, so that other repositories keep their conversations.
59. As an architect, I want a coordinator turn to show in the conversation of the workhorse that it delegated to, so that I can follow what voice asked for.
60. As an architect, I want the Stop control to stop the shown workhorse, so that a stop does not end work in another repository.
61. As an architect, I want a spoken stop to stop every running workhorse of my tab, so that "stop" stops what is happening.
62. As an architect, I want workhorse news to name its checkout, so that the voice says which repository finished.
63. As an architect, I want a workhorse to stay when the chosen checkout of its repository changes, so that work in a worktree is not lost when I switch.
64. As a user's own coding agent, I want the implementation brief to name the checkout and give `-C`, so that I reach the right vault.

### Moving a board

65. As an architect, I want to move a board to another repository from the browser, so that a board drawn in the wrong place goes where it belongs.
66. As an agent, I want `archboard semantic move <board> --to <dir>` with `--doing`, so that I can do the same move.
67. As an architect, I want the move to keep every variant, former name and subject id, so that the comparison and the history stay true.
68. As an architect, I want to see the drill-downs that a move rewrites before I confirm it, so that I know what else changes.
69. As an architect, I want drill-downs in the source vault into the moved board, and drill-downs on the moved board into the source vault, rewritten to name repository identities, so that no link breaks inside the two vaults.
70. As an architect, I want a move between two checkouts of one repository refused, so that git stays the way boards travel between branches.
71. As an architect, I want a move refused while somebody else claims the board or its name in the target, so that a move never takes work from an agent.
72. As an architect, I want a move refused when the target vault has a board or a former name with the same name, so that no board is lost.
73. As an architect, I want a move refused when it needs a drill-down into an untracked vault, so that no note holds a path.
74. As an architect, I want a move that stops part way to leave the board in both vaults and never in neither, and the same move to finish it, so that nothing is lost.
75. As an architect, I want the pane that showed the board to show it in its new repository after the move, so that I do not have to find it again.
76. As an agent in another vault, I want `archboard check` to report a drill-down into a board that moved away, so that I can correct it.

### Developing archboard

77. As an archboard developer, I want `archboard` inside an archboard checkout to run that checkout's own source, so that a worktree tests its own changes.
78. As an archboard developer, I want each linked worktree of archboard to use its own stable port, so that a worktree server never takes over my daily boards on port 3000.
79. As an archboard developer, I want the main checkout to keep port 3000, so that my bookmarks and habits stay.
80. As an archboard developer, I want `/health` to report the source checkout, and a command that finds a server of other source on its port to refuse and name both checkouts, so that I never talk to the wrong source.
81. As an archboard developer, I want `ARCHBOARD_URL` and `--url` to still decide when I set them, so that I can run a server where I need one.
82. As a test author, I want an isolated server with its own port, state directory and vaults in the `<dir>/.archboard/vault` layout, so that tests never touch my machine's server.
83. As the person who runs skill evaluations, I want the evaluation world to keep its vault inside its flask checkout and to record that the change breaks comparison with older batches, so that results are read correctly.

### Install

84. As an architect, I want `install-skill` to write no setup block, and to remove an old one when it runs again, so that no tracked file holds a path of my machine.
85. As an agent, I want the archboard-pr skill to trigger on a repository that has `.archboard/vault`, so that it no longer depends on the setup block.

## Implementation Decisions

- The store, the lock state, the board catalogue, the configuration loader, the
  former-name lookup, the disk watch and the code check take the vault root as
  an argument. Nothing reads a process-wide vault. This refactor comes first,
  while the server still serves one vault.
- The vault finder is one function in the engine, used by the CLI and by every
  process that the CLI starts. Its input is a directory. Its output is the vault
  root, the origin (`-C` or the working directory), and for a checkout the
  checkout root and the repository identity. A git checkout uses only the
  `.archboard/vault` at its root. Outside a checkout, the nearest enclosing
  `.archboard/vault` counts.
- `ARCHBOARD_VAULT` is refused at the CLI boundary, as `EXPRESS_SERVER_URL` is
  refused today, before the server is started or reached. If the variable
  comes from `.env`, the refusal fires too.
- The CLI sends the vault root with every board call. The server resolves each
  call against that root and keeps no default. The server starts without a
  vault. Vault root and board key together are the key of these: board
  announcements, claims, doing lines, the agent activity list, the settled
  change feed, the lock sweep and the disk fingerprint.
- The checkout registry changes shape. It holds entries keyed by directory.
  Each entry is a checkout with a repository identity, or an untracked vault
  with a registry name. It also records one chosen checkout for each identity.
  It reads a legacy `repos.json`, in which each identity maps to one checkout,
  as known checkouts that are each chosen. `repo add` registers. `repo use`
  chooses. `repo forget` removes. `repo list` reports chosen and gone entries.
  The first command in an unregistered checkout or untracked vault registers it
  and says so in its answer. `git worktree list` of a known checkout adds its
  worktrees as known checkouts.
- A registry name is the base name of the directory, made unique on this
  machine. The browser shows it, and the URL carries it for an untracked vault.
- One resolution rule serves code targets, the code check, `behind`, the
  footprint and the locality reading. A binding or anchor into the vault's own
  repository identity resolves in the vault's own checkout. Any other identity
  resolves in its chosen checkout.
- The drill-down schema gains an optional repository identity. Without one, the
  target stays in the vault of the board. With one, the target is in the vault
  of the identity's chosen checkout. The vault diagnostics report an unknown
  target in another repository, and the write refuses a drill-down that needs a
  path.
- The board listing route gains a repository dimension. The browser asks for
  the list of repositories and untracked vaults, then for the boards of each.
  If no known checkout of an identity has a vault, the list leaves the identity out.
- A pane address is a board key with a repository parameter of its own in the
  URL, one for each pane. Picture cache keys and socket message filters add the
  vault. A pane that receives a change of chosen checkout for its identity
  reads its board again.
- A registry route lets the browser list the checkouts of an identity and
  choose one. It follows the opener setting's pattern: a machine-wide setting
  that the browser writes through a guarded loopback route. It is not board
  content.
- `browser show` sends the caller's checkout. If that checkout is not chosen,
  the server chooses it first and reports the checkout that it replaced.
  `browser panes` adds the repository identity, the checkout and an own-checkout
  flag to each pane.
- The CLI entry point checks whether its working directory is inside a checkout
  of archboard whose source is not the running source. If it is, the CLI
  executes that checkout's `bin/archboard` with the same arguments. A linked
  worktree gets a default port from a stable hash of its root path into 10000
  to 19999, and the main checkout keeps 3000. `/health` adds the source
  checkout. A command that finds a server of other source on its port refuses
  and names both. `bin/dogfood` is deleted.
- The Codex child environment drops `ARCHBOARD_VAULT`. A tab session holds one
  coordinator and a map from checkout to workhorse, each with its own thread
  link, queue and approvals. A workhorse thread starts with its checkout as its
  working directory and workspace root. The coordinator starts in its own
  directory under the state directory and delegates by checkout. Pane briefs,
  board news and workhorse news name the checkout of each board.
- The dock gains the shown conversation and a list of the live workhorses of
  the tab session. Only the user's acts switch the shown conversation: focus,
  the navigator, a drill-down and the list. The Stop control stops the shown
  workhorse, and a spoken stop stops every running workhorse.
- The board move is a store operation across two vaults. It holds the lease in
  both vaults, writes the target note, rewrites the affected drill-downs one
  board write at a time, and deletes the source note last. Run again, it
  finishes a move that stopped part way. The browser calls it through a guarded
  route. It writes no doing line for the browser, and the CLI form requires
  `--doing`.
- `install-skill` writes no setup block, removes an old one, and keeps creating
  `.archboard/vault`. The archboard-pr skill triggers on that directory
  (TASK-471.03).
- PRODUCT.md, the CLAUDE.md invariants, INSTALL.md, README.md, TESTING.md,
  `.archboard/README.md` and the archboard, archboard-pr and archboard-dev
  skills change with the task that makes each statement true.

## Testing Decisions

A good test drives the product through its public interface and asserts what a
user or an agent observes: exit status, machine-readable answers, files in a
vault, the registry, and what a pane shows. It does not assert wording, and it
does not reach into a module's private implementation (CLAUDE.md test policy).

These are the seams, from the highest down:

1. The CLI and server seam. The real CLI runs against an owned server with its
   own `HOME`, state directory, registry and port, in temporary git checkouts,
   worktrees and untracked directories. Prior art: the owned-server support and
   the CLI repository and install fixtures in the system tests. It owns these:
   - vault finding through `-C` and the working directory, and disclosure in
     every answer
   - the refusal of `ARCHBOARD_VAULT`
   - registration by first use, and `repo add`, `repo use`, `repo forget` and
     `repo list`
   - the binding resolution rule, through `check --code`
   - the drill-down diagnostics
   - the move and its refusals
   - `browser show` choosing a checkout
   - the source exec inside an archboard checkout, worktree ports, and the
     refusal on a source mismatch
2. The browser seam. The serial browser lane runs against an owned server.
   Prior art: the existing serial browser owners. It owns these:
   - the navigator and the checkout menu
   - the URL of two panes in two repositories
   - a drill-down across repositories
   - reloading after a change of chosen checkout
   - the moved board in its pane
   - the dock's shown conversation and its list of workhorses
3. The Codex process seam. The Codex workbench lifecycle tests run with the
   test Codex executable. Prior art: the Codex workbench lifecycle and storage
   process contracts. They own these:
   - the working directory of each workhorse and of the coordinator
   - the child environment without a vault
   - delegation by checkout
   - the targets of Stop and of a spoken stop

Two hidden rules get module owners, because the seams above reach them only
through slow setups. One is the vault finder, with a nested checkout, a
checkout without a vault inside an untracked vault, and a subdirectory. The
other is the reading of a legacy `repos.json`. The existing legacy-registration
test extends to the new shape. The worktree port is held by the CLI seam
through two worktrees that get two stable, different ports.

The opt-in topology lane keeps its two-server claim case. Two servers can still
serve one vault, for example the main server and a worktree server.

## Out of Scope

- A hosted Archboard with a database vault. A local board stores no repository
  field.
- A code check across every vault of the machine.
- A forwarding record for a moved board.
- A move between two checkouts of one repository. Git carries those boards.
- Resuming a workhorse thread that New conversation replaced.
- `-C` with a repository identity in place of a directory.
- Discovery of checkouts by scanning the file system.
- Phone or narrow layouts.

## Further Notes

- These are the dependencies. The store refactor comes first, and the registry
  shape is independent of it. Every-call vault naming needs the refactor. CLI
  vault finding needs both. The binding rule needs the registry. The drill-down
  identity needs the registry and vault naming. The archboard source exec and
  worktree ports, and the move of the tests and evaluations to the new layout,
  need CLI vault finding. The navigator needs the registry and vault naming.
  The panes need the navigator and the drill-down identity. `browser show` and
  `browser panes` need the panes. The move needs the drill-down identity and the
  panes. Workhorses for each checkout need vault naming. The dock needs them.
  TASK-471.03 needs the removal of `ARCHBOARD_VAULT`. TASK-471.02 is
  independent.
- TASK-471.01 was closed as superseded by ADR 0049.
- The next human-run skill evaluation batch is not directly comparable with
  earlier batches, because the vault moves into the flask checkout.
- The domain terms are Vault, Untracked vault, Checkout registry, Chosen
  checkout, Archboard server, Tab session, Workhorse, Thread link, Voice
  coordinator, Shown conversation and Drill-down in CONTEXT.md. "Project" is not
  a term, because a repository identity is already the name for it.
