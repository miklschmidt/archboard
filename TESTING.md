# Running archboard end to end

From a fresh checkout to Codex driving a board. `archboard --help` and each
command's help are the reference for flags; this file holds what they cannot
tell you.

## 1. Install

```bash
bun install                     # retry if it fails extracting a tarball
bun run build                   # the frontend, the only thing that is built
skills experimental_install     # third-party skills, pinned in skills-lock.json
bun scripts/sync-skills.ts      # ours, from skills/ (derived copies are untracked)
```

bun runs the server and the CLI from `src/` (ADR 0014). Edit only `skills/`;
do not commit the derived skill copies or any PNG, SVG or rendered diagram made
as proof.

## 2. Pick a vault

A board is one `.semantic.json` document in a vault, holding every variant of
that architecture. There is no default vault: set `ARCHBOARD_VAULT` before
`./bin/canvas start`, because the server does the vault I/O and refuses to start
without one (ADR 0015). The browser at <http://127.0.0.1:3000> is where a person
reads a board; authoring needs no browser at all.

A vault may hold `.excalidraw.md` notes from before ADR 0023. Nothing here reads
them, writes them or migrates them, and that is deliberate: they are left exactly
as they are.

## 3. Make the CLI available to Codex

```bash
ln -s /path/to/archboard/bin/canvas ~/.local/bin/archboard
cd /path/to/project && archboard install-skill --vault /path/to/vault
```

Canvas-driving commands auto-start the server; they start no other transport.

## 4. The Archboard-owned Codex session

Starting the canvas starts one package-local Codex app-server child over
stdio. Archboard owns its `CODEX_HOME`, `CODEX_SQLITE_HOME`, strict
`config.toml`, epoch manifests and sign-in, below
`$XDG_STATE_HOME/excalidraw-canvas/codex-workbench` (or
`~/.local/state/excalidraw-canvas/codex-workbench`). Never edit user-global
Codex configuration for this integration. A pane links to one workhorse; voice
attaches to a separate persistent coordinator for that link, never to the
workhorse itself.

## 5. A first session

You state what the architecture IS; the renderer owns every coordinate, colour
and connector route. Every write says what it is doing, and every edit says
which version it was written against:

```bash
echo '{"level":"system","nodes":[{"name":"API Gateway","kind":"service"},
               {"name":"Orders","kind":"service"}],
      "edges":[{"from":"API Gateway","to":"Orders","kind":"http"}]}' |
  ./bin/canvas semantic new payments --doing "drawing the payment path"

./bin/canvas semantic show payments
echo '{"nodes":[{"name":"Orders Queue","kind":"queue"}]}' |
  ./bin/canvas semantic edit payments --expect-version 1 --doing "adding the queue"

./bin/canvas semantic branch payments --as "Queued ingest" --expect-version 2 \
  --doing "proposing a queue"
./bin/canvas semantic render payments --out payments.svg
./bin/canvas semantic rasterize payments --out payments.png
./bin/canvas check
```

`semantic rasterize` needs a Chromium or Google Chrome executable on `PATH`,
or one named by `ARCHBOARD_RENDERER_CHROMIUM`; it starts its own headless
browser and stops it before answering. The PNG is the SVG at native scale, so
the two receipts state the same width and height.

The board is at `$ARCHBOARD_VAULT/payments.semantic.json`: one document holding
the current architecture and every proposal derived from it. A proposal is a
variant of the same board, so what it changed is derived on the way out rather
than written down twice.

Only `browser` commands touch a live session (`panes`, `open`, `close`,
`show`); each names its pane and none writes a board. `browser show
payments@<variant>` puts a proposal beside what it proposes to change.

## 6. Verify Codex semantic delivery

The module owners cover the
[bound app-server contract](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session);
the composition owner starts the application with its owned child, links a
workhorse and proves the real `src/server.ts` wires the change feed, the pane
context and the workbench together:

```bash
bun test src/runtime/codex-semantic-context/tests src/runtime/codex-thread-context/tests
bun test tests/system/canvas-state/codex-workbench-production.test.ts
```

Before accepting a release that changes the workbench or realtime path, run
the [clean-process real-voice smoke](docs/design/codex-workbench-voice-acceptance.md):
deterministic gates first, then a person proves microphone, speaker, sign-in,
reconnect, callback and spoken approval.

The complete local gate is `bun run check`; `docs/agents/test-suite.md`
explains the lanes and the browser prerequisites.

## 7. Evaluate the archboard skill (human-run, on demand)

`evals/` holds the canonical inputs of a model evaluation:
real Codex authors on pinned Flask checkouts, one blinded grader run by Codex
or by Claude Code (chosen when grading runs; the same batch can be graded by
both and the report says how they agree), deterministic checks and a
comparison report. It is never part of `bun run check`; every run calls a
model, so a person starts it:

```bash
bun run eval:skill check                  # validate the inputs, no model
bun run eval:skill run                    # both arms, every scenario, pinned repetitions
bun run eval:skill grade .skill-evals/<batch> --grader claude   # or --grader codex
bun run eval:skill report .skill-evals/<batch>
bun run eval:skill pin                    # rewrite the version pins from PATH, no model
```

[`evals/README.md`](evals/README.md) says
what one run is, how the grader is blinded, and how a baseline is reproduced.
Every run captures the diagrams its scenario declares through `semantic
rasterize`, so the machine that runs a batch needs a Chromium-family
executable as well (see [INSTALL.md](INSTALL.md#rendering-to-a-bitmap)).
The fast owners for the harness's deterministic parts live in
`src/runtime/skill-evaluation/tests`.

## Shared shell and SVG colors

Edit `src/shared/theme/theme.css` for light/dark shadcn colors and the
added/changed/removed comparison colors, plus the `--semantic-*` palette used by
node types, groups and relationships. `--diagram-edge` controls neutral arrows independently
of secondary text. All color definitions use OKLCH. `app.css` imports those tokens; the SVG
renderer resolves the same declarations through Lightning CSS and embeds sRGB
colors with their opacity. The shared file contains literal color custom
properties in `:root` and `:root[data-theme="dark"]`; keep layout values in
`app.css`. Unsupported cascade rules and unresolved colors are refused.

`archboard semantic render --theme light|dark` still needs no browser or frontend
build. Restart the canvas after editing the shared theme; rebuild the frontend
when serving its production bundle. The existing measured-text browser owner
also compares the built shell colors with standalone export colors in both themes.
