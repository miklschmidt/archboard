# archboard: agent-authored architecture models

Agents author architectural meaning, and the renderer draws it.
If a picture draws correct meaning wrong, repair the renderer.

Where things are written down:

- Who archboard serves and the rules every surface keeps: [PRODUCT.md](PRODUCT.md)
- Running it and making sure that it works: [TESTING.md](TESTING.md). Installing it elsewhere:
  [INSTALL.md](INSTALL.md)
- Domain language: [CONTEXT.md](CONTEXT.md). Module layout and import rules:
  [docs/agents/boundaries.md](docs/agents/boundaries.md)
- Changing frontend code: [docs/agents/frontend.md](docs/agents/frontend.md)
- Decisions: [docs/adr/](docs/adr/). Read the ADR before you touch what it decides.
- Measured investigations: [docs/design/](docs/design/). The visual authority of the UI is
  [docs/design/operator-canvas-shell.md](docs/design/operator-canvas-shell.md) with its reference image.
- Writing tests, and changing tests or CI: [docs/agents/test-suite.md](docs/agents/test-suite.md)
- Building and publishing a release on npm: [docs/agents/releasing.md](docs/agents/releasing.md)
- Refreshing the README's diagrams, clips, banner and videos:
  [docs/agents/readme-assets.md](docs/agents/readme-assets.md)
- Using archboard: the [archboard skill](skills/archboard/SKILL.md). Maintaining this repository's
  model and that skill: the [archboard-dev skill](skills/archboard-dev/SKILL.md).
- This repository's architecture: [.archboard/README.md](.archboard/README.md)
- Upgrading Codex: [docs/agents/codex-upgrades.md](docs/agents/codex-upgrades.md)
- Work tracking: Backlog.md through the `backlog` CLI, never by editing `backlog/`
- Skills: `skills/` holds only the shippable Archboard skills. Tracked symlinks in `.claude/skills/`
  and `.agents/skills/` expose them, beside the third-party skills tracked there.

## Track inputs and required artifacts

Track authored inputs, including the canonical model in `.archboard/vault`.
Keep cheaply reproducible output ignored unless it matches an exception below.
Build output, caches, and generated bindings stay ignored.

Keep these exceptions tracked:

- Archboard SVG and PNG files embedded in repository documents. Keep their render recipes. `archboard check embeds` discovers only Git-tracked files.
- Published documentation assets that readers need from the checkout. These include README diagrams, thumbnails, the social card, and `docs/readme/assets.json`. Follow [the asset guide](docs/agents/readme-assets.md) for updates. Large clips and videos remain external attachments.
- Exact historical fixtures, including `examples/web-shop/history.import.json`. They preserve readings and baselines that current inputs cannot reproduce. Follow [the fixture procedure](docs/agents/readme-assets.md#canonical-fixtures) when updating them.
- Dependency lockfiles: `bun.lock`, `Cargo.lock`, and `flake.lock`. They preserve the selected dependency versions for later installs.
- `bun.nix`, which the flake's release output (`nix build .#release`) installs its npm packages from. It is tracked because a flake reads only Git-tracked files. Update it with `bun2nix > bun.nix` inside `nix develop`. If it does not match `bun.lock`, the `bun-nix` gate task fails.

Do not untrack these exceptions merely because a tool produced them.
For a new exception, add its consumer, reason for tracking, and update procedure to this list.

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
