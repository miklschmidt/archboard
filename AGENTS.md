# archboard — agent-driven architecture canvas

A private internal tool, never published: a live Excalidraw canvas for building
and refactoring code and infrastructure architecture with an agent. `main`
forked from `yctimlin/mcp_excalidraw` v2.0.0 and is deliberately not kept
mergeable with it.

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
- Work tracking: Backlog.md through the `backlog` CLI, never by editing `backlog/`

## Environment facts you cannot derive

- This box has node and bun but no npm or npx: `bun run <script>`, never
  `npm run`. `bun install` intermittently fails extracting a tarball; run it again.
- A running server read its source at start. Editing source changes the next
  CLI command, not the running server: `./bin/canvas stop && ./bin/canvas start`.
  Stop refuses while a held board has work that exists only in memory.
- `bun run check` is the complete gate. `skills/` is the tracked source of the
  skills; `.agents/skills/` and `.claude/skills/` are derived and untracked
  (`bun scripts/sync-skills.ts`, `skills experimental_install`).

## Invariants nothing refuses

The loud rules teach themselves (a call naming no board, an agent write without
`--doing`, a stale version, a note changed under another editor are all refused
with the reason). These are the rules that will not stop you:

- **The note is the board; the canvas holds no copy** (ADR 0015).
  `src/runtime/engine/board-io.ts` is the one place a note is read or written,
  synchronously on purpose, and every write goes through `atomic-write.ts`
  including its fsync.
- **One writer at a time per board** (ADR 0016), a lease file taken by one
  write-boundary middleware, deny by default. Claim before substantial work.
- **A person's edit is optimistic, and the note still decides** (ADR 0022).
  The canvas shows a person's edit immediately, but a pane never drifts from
  the note on disk: its write is version-checked like any other, refused when
  stale, and the pane then reconciles to the note. While an agent claims a
  board, panes showing it take no content edits (pan and zoom still work),
  and every pane shows in real time which board an agent is editing. An agent
  may edit any board whether or not somebody is looking at it.
- **One converter, on the way in, nothing on the way out** (ADR 0015).
  `label: {text}` and arrow `start`/`end` are input spellings spent at the write
  boundary; the board holds the result. Binding-derived code links are a
  presentation overlay on copies, stripped at the write boundary, never persisted.
- **One thing somebody asked for is one write** (TASK-068).
- **Never rename an element id.** Every id comes from `src/shared/ids/ids.ts`
  (Obsidian block-id alphabet, one to eight characters); no second minting
  site. Why: `docs/design/server-is-the-truth.md` §4.
- **Text width is measured, not estimated** (`src/runtime/engine/measure-text.ts`).
- **Every write path replaces an element; nothing edits one in place.**
- **Every duration lives in `src/shared/timing/timing.ts`** with what it pulls
  against written beside it.
- **`customData.archboard` is archboard's metadata channel** (ADR 0003), never
  flat keys. A code binding persists only under `customData.archboard.binding`.
- **Codex runs as one private package-local app-server session over stdio**
  with its own `CODEX_HOME`; a pane's thread link names one workhorse and
  voice belongs to its separate coordinator. The
  [bound app-server design](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session)
  is the delivery and outcome contract.
- The shell is desktop-only at 1920×1080; do not add phone or narrow layouts.

## Test policy

**Mandatory: Never write tests that test contents of files. Tests should test
runtime behavior, not static content.**

Give each non-obvious regression one cheapest credible owner: types and lint
for structural rules, focused unit or integration owners for hidden behaviour,
rendered or browser owners for visible workflows, process or system owners only
when the bug needs that boundary. Remove an owner when normal use makes its
failure obvious, another owner catches it, or it mostly simulates upstream
tools. Never add repository-policy tests, configuration snapshots, or tests of
lint rules, tooling or test helpers; the maintainer deletes them on sight.

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
