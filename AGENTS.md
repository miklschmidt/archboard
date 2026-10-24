# archboard — agent-authored architecture boards

An architecture planning tool for software and cloud architects who work with
coding agents, public on GitHub under the Business Source License 1.1 and run from a clone. Agents author
the architecture of code and infrastructure as meaning, and the renderer draws
it. There is no way to move a box, and that is deliberate. If somebody repairs
the layout of a diagram by hand, a renderer improvement for every board at once
cannot improve that diagram (ADR 0023).

Where things are written down:

- Who archboard serves, its main job, and the rules every surface keeps:
  [PRODUCT.md](PRODUCT.md)
- Running it end to end and making sure that it works: [TESTING.md](TESTING.md). Installing
  it elsewhere: [INSTALL.md](INSTALL.md)
- Domain language: [CONTEXT.md](CONTEXT.md). Module layout and import rules:
  [docs/agents/boundaries.md](docs/agents/boundaries.md)
- Changing frontend code: read [docs/agents/frontend.md](docs/agents/frontend.md) for placement, React ownership,
  and the routing/query migration contract.
- Decisions: [docs/adr/](docs/adr/). Read the ADR before you touch what it decides.
- Measured investigations: [docs/design/](docs/design/). The visual authority of the UI is
  [docs/design/operator-canvas-shell.md](docs/design/operator-canvas-shell.md) with its reference image.
- Changing tests or CI: [docs/agents/test-suite.md](docs/agents/test-suite.md)
- Refreshing the README's diagrams, clips, banner and videos:
  [docs/agents/readme-assets.md](docs/agents/readme-assets.md)
- Maintaining architecture boards and the consumer skill: the [archboard-dev skill](skills/archboard-dev/SKILL.md).
  Using archboard: the [archboard skill](skills/archboard/SKILL.md).
- Upgrading Codex: read [docs/agents/codex-upgrades.md](docs/agents/codex-upgrades.md).
- Reading or updating this repo's architecture: [.archboard/README.md](.archboard/README.md). Start at
  `Archboard` with `archboard` and the tracked `.archboard/vault`.
- Work tracking: Backlog.md through the `backlog` CLI, never by editing `backlog/`

## Environment facts you cannot derive

- This box has node and bun but no npm or npx. Use `bun run <script>`, never
  `npm run`. `bun install` intermittently fails to extract a tarball. If it
  fails, run it again.
- The renderer core is Rust, built to WebAssembly (ADR 0057). Run Rust and
  build commands inside `nix develop`, which gives cargo, `wasm-bindgen` and
  Bun. After a change to `crates/`, run `bun run build:core`:
  a Bun process refuses a core built from other sources than its checkout
  holds.
- A running server read its source at start. Editing source changes the next
  CLI command, not the running server: `archboard restart` stops it, builds
  the frontend and starts it again.
  Stop never waits for work: every accepted write is on disk before it is answered.
- `archboard` on PATH links to one checkout's `bin/archboard`. Inside another
  archboard checkout, such as a worktree, it runs that checkout's own
  `bin/archboard` (ADR 0049). The server of the main checkout listens on
  port 3000. The server of a linked worktree listens on a port in 10000 to
  19999, a hash of the worktree's path, so each worktree has its own server.
  `archboard status` gives the URL. A set `ARCHBOARD_URL` or `--url` still
  decides. A command whose environment sets `ARCHBOARD_URL` runs where it is
  and hands off to no checkout: the URL names its server already. The Codex
  workbench sets it on every thread and puts the server's own `bin` first on
  the thread's PATH, so a workhorse in an archboard worktree reaches the server
  that started it. A command that finds a server of another checkout's source
  on its port refuses and names both checkouts.
- `bun run check` is the complete gate. Only shippable, repository-authored
  Archboard skills live under `skills/`. Tracked symlinks expose them through
  `.claude/skills/` and `.agents/skills/`. For other skills, use the exact path
  in the skill catalog. Third-party skills are tracked under `.agents/skills/`
  and `.claude/skills/`.

## Invariants nothing refuses

The loud rules teach themselves (a call naming no board, an agent write without
`--doing` and a stale version are all refused with the reason). These are the
rules that will not stop you:

- **The file is the board, and nothing holds a copy of it** (ADR 0015, ADR 0023).
  One `.semantic.json` document per board holds every variant of it, and
  `packages/board/src/runtime` (the `store` and `operations` folders of `@archboard/board`) is
  the one place one is read or written.
  Every write goes through `atomic-write.ts`, fsync included, and is committed
  before it is answered.
- **Agents author, users read.** The browser is a viewer and writes no board
  content. It holds board content only as a read-only cache of what the server
  said. When the server announces a new version, the browser reads that content
  again (ADR 0023). It owns only presentation: the camera, the active view, the
  walkthrough position and what somebody picked out. It also keeps its tab
  session id in sessionStorage. That id tells the server which tab a pane
  belongs to, and it is not board content. A user has two controls over a
  board: taking back somebody else's claim, and moving the board to another
  repository (ADR 0051). The move is the person's own act. It states the human
  origin and the version the browser previewed, and it writes no doing line.
- **Every call to the server names its vault** (ADR 0049). The vault on the wire
  is the vault's own directory: `?vault=<directory>` on a request or a `vault`
  field in its body, and `?vault=` on the pane socket's URL, which names it once
  for that socket. A call that names none is refused with `VAULT_REQUIRED`
  (400). A vault the server cannot read is refused with `VAULT_UNREADABLE` (404),
  and nothing is created. A pane socket that names one goes to its repository's
  chosen checkout, else to where a page opens, and is refused only with neither.
  There is no default vault, and the server starts with
  none. The server's process memory
  is keyed by vault and board together (`boardMemoryKey`): claims, revocations,
  announced lock state, doing lines, agent activity and the disk watch. Each
  change on the change feed and each remembered code finding names its vault.
  News of a write goes only to the panes of that vault. Agent activity is the one
  exception. It names its vault and goes to every pane, because the navigator
  marks the boards of every repository (ADR 0022). Each browser pane
  names the vault the server put it in (ADR 0050). A pane opens in the vault the
  server reports at `/api/served-vault`: the first ready repository by name, else
  none, and then the page says how to make a repository known. The server serves
  only a vault in the `<dir>/.archboard/vault` layout (`isVaultLayout`), because
  a workhorse works in the directory that holds its vault. A call that names
  another directory is refused with `VAULT_UNREADABLE`.
- **The CLI finds its vault from the directory it runs in** (ADR 0049), as git
  finds its repository: from `-C <dir>`, else the working directory. A set
  `ARCHBOARD_VAULT`, also from `.env`, makes every command refuse (exit 2)
  instead of being ignored. Inside a git
  checkout only `<root>/.archboard/vault` counts. A checkout without one is
  refused with `VAULT_NOT_FOUND` (exit 2), and nothing above the root is used.
  The one exception is `check`, `check all` and `check embeds` (contract field
  `runsWithoutVault`). In a checkout without a vault they run the embeds check
  alone, and the answer names no vault. `check` and `check all` say in
  `skipped` that the semantics and code checks did not run.
  Outside any checkout the nearest enclosing `<dir>/.archboard/vault` counts.
  `-C` is a shared option of the commands that call a vault. It stands before
  or after the command name. It changes only where the vault is found:
  `--input`, `--out` and other paths resolve against the working directory.
  Every JSON answer of those commands that found a vault names
  `vault: {path, origin}` (`-C` or `working-directory`). The registry can lack the checkout or untracked vault that a command finds.
  That command then registers it, says so in `vault.registered` and writes one
  line to stderr. The Codex child holds no vault setting: a thread's board
  context names each board's vault, and a thread passes it as `-C`.
- **One writer at a time per board** (ADR 0016), a lease file taken by one
  write-boundary middleware, deny by default. Claim before substantial work.
- **A claim is visible, and the one control is taking it back** (ADR 0022).
  While an agent claims a board, every pane that shows the board says who has
  it, why, and since when. The pane also offers the control that ends the claim.
  The pane keeps drawing, because a claim never stops reading. An agent can
  write any board, whether or not somebody is looking at it. If an agent lost a
  claim, the server tells it once, on its next write.
- **One thing somebody asked for is one write** (TASK-068). A board's whole
  family lands together or not at all: a parent edit and every descendant's
  answer to it are one version. A move to another repository's vault cannot be
  one write, because two vaults are two files (ADR 0051). It writes the target
  note first, then each drill-down it rewrites, and deletes the source note
  last. A stopped move leaves the board in both vaults, never in neither, and
  the same move run again finishes it.
- **A board is addressed by name, and a variant is a reading of it.**
  `payments` and `payments@<variant>` name the same document, split at the FIRST
  `@`. A board name can never hold one, and a variant's name can. The file, the
  lease, the claim and what an agent said it was doing are all facts about the
  board. Only what is drawn depends on the variant.
- **Never rename a subject id.** Every id comes from
  `packages/board/src/shared/rules/ids.ts` (one to eight characters). No second
  site mints an id. An id is what a proposal is compared by, so renaming one
  makes a change look like a deletion and an addition.
- **Text width is measured, not estimated**, by the canvas of the place that draws the
  picture with the diagram fonts loaded: the browser's own, or `@napi-rs/canvas`
  under Bun (TASK-247).
  `tests/system/browser/measured-text.test.ts` holds the Bun canvas to what Chrome draws.
- **Every duration lives in the `@archboard/timing` package** (`packages/timing`) with what it
  pulls against written beside it.
- **A node's code binding is part of its meaning**, not a presentation overlay:
  it persists on the node as `binding: { repo, path }` and is what "open the
  code" resolves.
- **Codex runs as one private package-local app-server session over stdio**
  with an archboard-only `CODEX_HOME` every Archboard server on the machine shares.
  Each browser tab is a tab session with one coordinator, and voice belongs to
  that coordinator. The app-server and the coordinator work in a directory of
  their own under the state directory, which is no checkout and holds no
  vault, so a coordinator command without `-C` is refused. A tab session has
  one workhorse for each checkout it works in, built on first use. Each
  workhorse works in its checkout (the directory that holds the vault) and
  has its own thread link, queue and approvals. Every pane of a tab shows the
  tab's shown conversation: the workhorse of the checkout that the person last
  activated in the page. Only the browser's activation call changes it, never
  an agent's `browser show` and never a new chosen checkout (ADR 0050). [ADR
  0019](docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md)
  records the app-server session.
- The shell is desktop-only at 1920×1080. Do not add phone or narrow layouts.

## Test policy

**Test observable behavior and contracts.** A test is there to catch incorrect
behavior, not only a change to how repository files are worded or organized.

**Test behavior and contracts, not human-readable wording.** For CLI help,
diagnostics and UI copy, test routing, exit status, side effects, structure
and formatting. Do not lock that copy down with text matching, prose snapshots
or full-output equality.

When a test covers generic CLI behavior, discover commands and options from
authoritative runtime metadata. Adding or renaming a flag, or editing a
description, must not require updating help-test expectations.

Assert exact values only where they are the behavior under test, such as
machine-readable results or protocol fields. Before you add an assertion,
name the behavioral regression that it catches. If it only detects a wording
change or duplicates upstream library coverage, omit it.

Give each non-obvious regression one cheapest credible owner:

- types and lint for structural rules
- focused unit or integration owners for hidden behaviour
- rendered or browser owners for visible workflows
- process or system owners, only for a bug that needs that boundary

If normal use makes the failure of an owner obvious, another owner catches it,
or it mostly simulates upstream tools, remove that owner.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview`
before you answer or act**.

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or
  assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before marking acceptance criteria as
  done, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files
directly. Use the `backlog` CLI so metadata, relationships, and history stay
consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
