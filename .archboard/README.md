# Archboard's architecture model

The files in `vault/` describe one canonical model of this repository.
Its stable model identity is `vKEsyHFk`.
Modules own their outgoing relationships and form a recursive containment forest.
Flow collections describe independent exchanges across those modules.
A reading selects scope and presentation without owning architecture content.

Keep authored inputs in Git and change them through the public CLI.
The runtime owns serialization, subject claims, exact revision checks, signed retention, and durable installation.
The source formatter excludes these inputs because their exact bytes identify a revision.
Rendered pictures are derived artifacts and contain no second authored model.

## Open the model

From this checkout, run:

```bash
archboard start
archboard model read
archboard browser panes
```

Open the URL reported by `start` with `?modelA=vKEsyHFk`.
After the browser connects, address its pane explicitly:

```bash
archboard browser show vKEsyHFk --pane A
```

Commands discover `.archboard/vault` from the checkout root, or from the checkout named by `-C`.
Each JSON answer identifies the vault that it used.
The main checkout normally serves port 3000.
A linked worktree has its own source and stable port between 10000 and 19999.
Run `archboard status` to read that address.
Restart the server after changing its source.
See [TESTING.md](../TESTING.md) for setup and browser validation.

## Explore recursive ownership

Open a module to read its children, interface, and connections.
The module keeps its identity when the scope changes.
Use breadcrumbs to return to its parent.
Selection, Focus, filters, and the diagram selector change only the reading.
Sequence and flowchart readings require an authored flow.

The existing source owners provide useful starting scopes:

| Scope              | Stable module identity       | Source owner                    |
| ------------------ | ---------------------------- | ------------------------------- |
| CLI                | `vKEsyHFk/vKEsyHFk#TBnOCNx2` | `apps/cli`                      |
| Server             | `vKEsyHFk/vKEsyHFk#cPOdAA3f` | `apps/server`                   |
| Browser            | `vKEsyHFk/vKEsyHFk#6nZjwK9W` | `apps/web`                      |
| Shared packages    | `vKEsyHFk/vKEsyHFk#fssx6Gaq` | `packages`                      |
| Model runtime      | `vKEsyHFk/0T9enjhi#1VHRyajb` | `packages/board`                |
| Renderer           | `vKEsyHFk/vKEsyHFk#OHywsFXm` | `packages/renderer`             |
| Local workbench    | `vKEsyHFk/vKEsyHFk#sw4oFps0` | `packages/workbench`            |
| Voice coordination | `vKEsyHFk/vKEsyHFk#lU0khwR0` | `packages/codex-realtime-voice` |
| Example host       | `vKEsyHFk/vKEsyHFk#xssnUgIk` | `apps/workbench-example`        |

For example:

```bash
archboard model read 'vKEsyHFk/0T9enjhi#1VHRyajb'
archboard browser show vKEsyHFk --pane A --module 'vKEsyHFk/0T9enjhi#1VHRyajb'
```

Packages remain independent of the applications that call them.
An outgoing relationship does not establish containment.
The package layer groups describe dependency direction, not fixed module depths.
External participants remain outside Archboard's implementation ownership.

## Proposals and walkthroughs

Create a compact proposal for each architectural intent.
One proposal can change several modules, relationships, flows, and walkthroughs.
Matching names never combine independent proposals.
Preserve continuing subject identities and let the writer allocate new identities.
Use the revision from the complete reading and claim the affected subjects before writing.

The [archboard-dev skill](../skills/archboard-dev/SKILL.md) explains the repository workflow.
The [consumer skill](../skills/archboard/SKILL.md) gives the public command contracts.
Adoption and shelving require an explicit decision.
A source commit or code merge does not adopt architecture.

`From modules to durable architecture` explains the canonical model through scoped readings and the current durable-edit flow.
Each beat states its complete reading, so presentation does not inherit an earlier beat's scope or selection.
The `Original` walkthroughs retain their earlier explanations against an exact checkpoint.
They do not describe the current implementation.

## Retained originals and history

TASK-549 migrates the original board documents through explicit identity choices and the public installer.
Their exact bytes, state history, and independent drafts remain retained.
Original IDs in qualified module addresses record provenance; they no longer define separate live boards.

Use `model checkpoints` to discover retained readings.
Use an exact checkpoint when sharing or recording a walkthrough.
An installed former address opens only the original coverage that its saved mapping identifies.
An unresolved historical reference stays unavailable with its original files and recovery information.
Never substitute present-day architecture for that missing evidence.

A source push does not publish the architecture archive.
Follow the consumer skill's publication workflow to share required checkpoints deliberately.
A factual correction creates an auditable new reading and preserves the previous immutable inputs.

## Source evidence and exports

Run `archboard check semantics` for model validity and `archboard check code` for current source evidence.
Use `--state <proposal-id>` to inspect a proposal before adoption.
Fix findings caused by the task and record real evidence limits.
The code checker reports canonical model, state, subject, and input revision identities.

Use `model locality` for recent changes and source coupling.
Use `model footprint --base main` to compare local source changes with architecture.
Neither operation retains source history or fetches code automatically.

Write exports outside the authored vault:

```bash
archboard model render --module 'vKEsyHFk/0T9enjhi#1VHRyajb' --out /tmp/archboard-runtime.svg
archboard check embeds
```

Git supplies the tracked artifact list.
Each recipe identifies its exact reading and rendering choices.
The renderer owns placement, measurement, and routing; authored modules contain no geometry.
