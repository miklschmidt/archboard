# archboard — agent-authored architecture boards

A private internal tool, never published: agents author the architecture of code
and infrastructure as meaning, and the renderer draws it. There is no way to move
a box and deliberately none — a diagram whose layout somebody repaired by hand
cannot be improved for every board at once (ADR 0023). `main` forked from
`yctimlin/mcp_excalidraw` v2.0.0 and is deliberately not kept mergeable with it.

Where things are written down:

- Design, roadmap, the bound Codex app-server contract: `DESIGN.md`
- Running and verifying it end to end: `TESTING.md`; installing it elsewhere: `INSTALL.md`
- Domain language: `CONTEXT.md`; module layout and import rules: `docs/agents/boundaries.md`
- Changing frontend code: read `docs/agents/frontend.md` for placement, React ownership,
  and the routing/query migration contract.
- Decisions: `docs/adr/` — read the ADR before touching what it decides
- Measured investigations: `docs/design/`; the UI's visual authority is
  `docs/design/operator-canvas-shell.md` with its reference image
- Changing tests or CI: `docs/agents/test-suite.md`
- Working on this repo: the `archboard-dev` skill; using the canvas: the `archboard` skill
- Reading or updating this repo's architecture: `.archboard/README.md`; start at
  `Archboard` using `./bin/dogfood` and the tracked `.archboard/vault`.
- Work tracking: Backlog.md through the `backlog` CLI, never by editing `backlog/`

## Environment facts you cannot derive

- This box has node and bun but no npm or npx: `bun run <script>`, never
  `npm run`. `bun install` intermittently fails extracting a tarball; run it again.
- A running server read its source at start. Editing source changes the next
  CLI command, not the running server: `./bin/canvas stop && ./bin/canvas start`.
  Stop never refuses: every accepted write is on disk before it is answered.
- `bun run check` is the complete gate. `skills/` is the tracked source of the
  skills; `.agents/skills/` and `.claude/skills/` are derived and untracked
  (`bun scripts/sync-skills.ts`, `skills experimental_install`).

## Invariants nothing refuses

The loud rules teach themselves (a call naming no board, an agent write without
`--doing`, a stale version, a note changed under another editor are all refused
with the reason). These are the rules that will not stop you:

- **The file is the board; nothing holds a copy of it** (ADR 0015, ADR 0023).
  One `.semantic.json` document per board holds every variant of it, and
  `src/runtime/semantic-board-store` is the one place one is read or written.
  Every write goes through `atomic-write.ts`, fsync included, and is committed
  before it is answered.
- **Agents author, users read.** The browser is a viewer: it writes nothing,
  holds board content only as a read-only cache of what the server said (read
  again when the server announces a new version, ADR 0023), and owns only
  presentation — the camera, the active view, the walkthrough position and what
  somebody picked out. A user's one control over a board is taking back
  somebody else's claim.
- **One writer at a time per board** (ADR 0016), a lease file taken by one
  write-boundary middleware, deny by default. Claim before substantial work.
- **A claim is visible, and the one control is taking it back** (ADR 0022).
  While an agent claims a board, every pane showing it says who has it, why, and
  since when, and offers the control that ends it — and keeps drawing, because
  reading is never what a claim stops. An agent may write any board whether or
  not somebody is looking at it, and is told once, on its next write, that it
  lost one.
- **One thing somebody asked for is one write** (TASK-068). A board's whole
  family lands together or not at all: a parent edit and every descendant's
  answer to it are one version.
- **A board is addressed by name; a variant is a reading of it.**
  `payments` and `payments@<variant>` name the same document, split at the FIRST
  `@` — a board name can never hold one and a variant's name can. The file, the lease, the claim and what an agent said it was doing are
  all facts about the board; only what is drawn depends on the variant.
- **Never rename a subject id.** Every id comes from `src/shared/ids/ids.ts`
  (one to eight characters); no second minting site. An id is what a proposal is
  compared by, so renaming one makes a change look like a deletion and an
  addition.
- **Text width is measured, not estimated**, by the canvas of the place that draws the
  picture with the diagram fonts loaded: the browser's own, or `@napi-rs/canvas` under Bun (TASK-247).
  `tests/system/browser/measured-text.test.ts` holds the Bun canvas to what Chrome draws.
- **Every duration lives in `src/shared/timing/timing.ts`** with what it pulls
  against written beside it.
- **A node's code binding is part of its meaning**, not a presentation overlay:
  it persists on the node as `binding: { repo, path }` and is what "open the
  code" resolves.
- **Codex runs as one private package-local app-server session over stdio**
  with its own `CODEX_HOME`; a pane's thread link names one workhorse and
  voice belongs to its separate coordinator. The
  [bound app-server design](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session)
  is the delivery and outcome contract.
- The shell is desktop-only at 1920×1080; do not add phone or narrow layouts.

## Test policy

**Test observable behavior and contracts.** A test should catch incorrect
behavior, not merely a change to how repository files are worded or organized.

**Test behavior and contracts, not human-readable wording.** For CLI help,
diagnostics and UI copy, verify routing, exit status, side effects, structure
and formatting. Do not lock that copy down with text matching, prose snapshots
or full-output equality.

Discover commands and options from authoritative runtime metadata when
testing generic CLI behavior. Adding or renaming a flag, or editing a
description, must not require updating help-test expectations.

Assert exact values only where they are the behavior under test, such as
machine-readable results or protocol fields. Before adding an assertion,
name the behavioral regression it catches; if it only detects a wording
change or duplicates upstream library coverage, omit it.

Give each non-obvious regression one cheapest credible owner: types and lint
for structural rules, focused unit or integration owners for hidden behaviour,
rendered or browser owners for visible workflows, process or system owners only
when the bug needs that boundary. Remove an owner when normal use makes its
failure obvious, another owner catches it, or it mostly simulates upstream
tools.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
