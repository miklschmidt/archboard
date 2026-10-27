# archboard: agent-authored architecture models

Archboard serves software and cloud architects who work with coding agents.
It runs locally from a clone under the Business Source License 1.1.
Agents author architectural meaning, and the renderer draws it.
Repair incorrect geometry in the renderer so that every reading benefits.

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
- Maintaining the architecture model and consumer skill: the [archboard-dev skill](skills/archboard-dev/SKILL.md).
  Using archboard: the [archboard skill](skills/archboard/SKILL.md).
- Upgrading Codex: read [docs/agents/codex-upgrades.md](docs/agents/codex-upgrades.md).
- Reading or updating this repo's architecture: [.archboard/README.md](.archboard/README.md). Use `archboard model read` in the tracked `.archboard/vault`.
  If it returns `LEGACY_AUTHORITY`, follow the consumer skill's explicit migration reference.
- Work tracking: Backlog.md through the `backlog` CLI, never by editing `backlog/`

## Environment facts you cannot derive

- This box has node and bun but no npm or npx. Use `bun run <script>`, never
  `npm run`. `bun install` intermittently fails to extract a tarball. If it
  fails, run it again.
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

## Architecture invariants

[CONTEXT.md](CONTEXT.md) defines the model vocabulary.
[The consumer skill](skills/archboard/SKILL.md) owns the authoring workflow and command recipes.
[ADR 0062](docs/adr/0062-one-live-canonical-model-and-consumer-path.md) records the transition pending parent acceptance.

- One vault holds one canonical model. `model.json` identifies it and its optional current designation.
  Each `.module.json` file owns one module and its outgoing relationships.
  Derive incoming connections and assembled readings from those inputs.
  Modules form a containment forest without fixed levels or numeric depth.
- Independent `.flows.json` collections own complete behavioral exchanges across modules.
  A reading selects scope, focus, filters, grammar, and optional flow without copying architecture.
  Sequence and flowchart require an authored flow.
- Active `.proposal.json` files store identity changes against retained baselines.
  `.walkthrough.json` files hold narrative beats and complete reading instructions.
  Completed states and decisions live in the independent Git archive.
  A source merge, checkpoint, or approval never adopts a proposal.
- `packages/board/src/runtime` owns coherent reads and durable writes through its public interface.
  Submit one complete intent with its operation identity, writer, doing line, target, and full expected revision.
  The shared installer prepares signed history, journals the operation, and installs affected files through durable atomic writes.
  Only durable completion announces a change to readers.
- Claim affected subjects, state, and structure scopes before substantial work.
  Claims remain visible and permit reading.
  The short vault installation lease stays free between operations.
  A human can take back a claim. Stop the revoked intent when its next write reports that revocation.
- If a write returns `RECOVERY_REQUIRED`, use `model recover` in the original checkout.
  Preserve foreign edits and the journal when recovery refuses.
  Retry a lost response with the exact original operation identity and request.
  Use a new identity for a changed intent.
- Keep continuing subject identities unchanged.
  `packages/board/src/shared/rules/ids.ts` is the only allocator of short local IDs.
  Qualified namespaces preserve imported provenance, not board ownership.
  Names, paths, and matching bindings never establish shared identity.
- Retain exact checkpoints before sharing history or recording walkthroughs.
  Keep configured Git signing enabled for source commits and archive operations.
  A normal source push does not publish the independent archive.
  Use explicit publication and fetch operations for its complete dependency history.
  Report unavailable source separately from unavailable architecture.
- Legacy decoding serves explicit migration and exact retained originals only.
  `LEGACY_AUTHORITY` requires inventory, deliberate identity mappings, preview, and owner-authorized migration.
  Preserve originals through the migration archive before cutover.
  Never infer mappings or combine independent proposals from matching names or task IDs.
  Canonical ownership transfer between models is unavailable.
- Agents author, users read. The browser caches server content and owns presentation, selection, and playback position.
  It writes no architectural content.
  Its sessionStorage tab identity identifies pane ownership, not model content.
  Rendering and agent execution remain local or on the client.
- Every server request names its vault (ADR 0049).
  Requests use `?vault=<directory>` or a body `vault` field.
  A pane socket names its vault in its URL.
  Missing vaults return `VAULT_REQUIRED` (400), and unreadable vaults return `VAULT_UNREADABLE` (404).
  The server starts without a vault and serves only the `<dir>/.archboard/vault` layout.
  A page learns its initial vault from `/api/served-vault`.
  Model changes name their vault and reach that vault's subscribers.
- The CLI discovers its vault from `-C <dir>`, otherwise from its working directory.
  Inside Git, only `<root>/.archboard/vault` counts.
  Outside Git, the nearest enclosing vault counts.
  A set `ARCHBOARD_VAULT`, including in `.env`, causes refusal with exit status 2.
  `-C` changes discovery only. Other relative paths still resolve against the working directory.
  Successful discovery names `vault: {path, origin}` and reports first-time registration.
  Without a vault, `check`, `check all`, and `check embeds` can inspect embeds alone.
  `check` and `check all` report skipped semantic and code work.
- Text width uses the drawing host's canvas with diagram fonts loaded.
  The browser uses its canvas, and Bun uses `@napi-rs/canvas`.
  `tests/system/browser/measured-text.test.ts` owns their agreement.
  Every duration lives in `@archboard/timing` with its purpose beside it.
- A module's code binding is part of its meaning.
  It names a repository and relative path, with optional source selectors.
  Use the existing checkout resolver for local opening and exact source evidence.
- Codex uses one private package-local app-server session over stdio per Archboard server.
  Every server shares the Archboard-only `CODEX_HOME` and sign-in.
  Each tab has one coordinator and one workhorse per addressed checkout.
  The coordinator works outside checkouts and must pass `-C` for vault commands.
  Each workhorse works in its checkout and keeps its own queue and approvals.
  Only browser activation changes the tab's shown conversation (ADR 0050).
  An agent's `browser show` and a new chosen checkout never activate another conversation.
  [ADR 0019](docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md) records session ownership.
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
