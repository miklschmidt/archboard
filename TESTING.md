# Running archboard end to end

From a fresh checkout to Codex driving a board. `archboard --help` and each
command's help are the reference for flags; this file holds what they cannot
tell you.

## 1. Install

```bash
bun install                     # retry if it fails extracting a tarball
bun run build                   # the frontend, the only thing that is built
skills experimental_install     # third-party skills, pinned in skills-lock.json
```

bun runs the server and the CLI from `src/` (ADR 0014). Edit only `skills/`;
do not commit the derived skill copies or any PNG, SVG or rendered diagram made
as proof.

## 2. Pick a vault

A board is one `.semantic.json` document in a vault, holding every variant of
that architecture. There is no default vault: set `ARCHBOARD_VAULT` before
`./bin/archboard start`, because the server does the vault I/O and refuses to start
without one (ADR 0015). The browser at <http://127.0.0.1:3000> is where a user
reads a board; authoring needs no browser at all.

## 3. Make the CLI available to Codex

```bash
ln -s /path/to/archboard/bin/archboard ~/.local/bin/archboard
cd /path/to/project && archboard install-skill --vault /path/to/vault
```

Commands that talk to the server auto-start it; they start no other transport.

## 4. The Archboard-owned Codex session

Starting the Archboard server starts one package-local Codex app-server child over
stdio. Archboard owns a `CODEX_HOME`, `CODEX_SQLITE_HOME`, a `config.toml`
that it gives the SQLite root and default permissions (it adds what is missing
and keeps what Codex or you set), and sign-in below `$XDG_STATE_HOME/archboard/codex-workbench` (or
`~/.local/state/archboard/codex-workbench`), which every Archboard server on the machine
shares; each server keeps its owner lock and epoch manifest under
`codex-workbench/canvases/<port>`. Never edit user-global
Codex configuration for this integration. An Archboard server has one conversation, one
workhorse that every pane shares, and nobody sets it up: the first message in
the agent bar, or the first press of Talk, signs in if needed, starts Codex and
links the workhorse. Voice attaches to a separate persistent coordinator for
that link, never to the workhorse itself.

## 5. A first session

You state what the architecture IS; the renderer owns every coordinate, colour
and connector route. Every write says what it is doing, and every edit says
which version it was written against:

```bash
echo '{"level":"system","nodes":[{"name":"API Gateway","kind":"service"},
               {"name":"Orders","kind":"service"}],
      "edges":[{"from":"API Gateway","to":"Orders","kind":"http"}]}' |
  ./bin/archboard semantic new payments --doing "drawing the payment path"

./bin/archboard semantic show payments
echo '{"nodes":[{"name":"Orders Queue","kind":"queue"}]}' |
  ./bin/archboard semantic edit payments --expect-version 1 --doing "adding the queue"

./bin/archboard semantic branch payments --as "Queued ingest" --expect-version 2 \
  --doing "proposing a queue"
./bin/archboard semantic render payments --out payments.svg
./bin/archboard semantic rasterize payments --out payments.png
./bin/archboard check
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
bun test tests/system/server-state/codex-workbench-production.test.ts
```

Before accepting a release that changes the workbench or realtime path, run
the [clean-process real-voice smoke](docs/design/codex-workbench-voice-acceptance.md):
deterministic gates first, then a user proves microphone, speaker, sign-in,
reconnect, callback and spoken approval.

A recording (`archboard semantic record`) runs end to end against the fake
Codex in `tests/system/server-state/walkthrough-recording.test.ts`: a real headless
Chromium, the real page, and a fake that speaks a transcript for every step it
is handed. What only a real voice can show, that it explains each step and falls
silent so the talk moves on, is the
[recording acceptance](docs/design/walkthrough-recording-acceptance.md).

The complete local gate is `bun run check`; `docs/agents/test-suite.md`
explains the lanes and the browser prerequisites.

## 7. Evaluate the archboard skill (human-run, on demand)

`evals/` holds the canonical inputs of a model evaluation:
real Codex authors on pinned Flask checkouts, one blinded grader run by Codex
or by Claude Code (chosen when grading runs; the same batch can be graded by
both and the report says how they agree), deterministic checks and a
comparison report. It is never part of `bun run check`; every run calls a
model, so a user starts it:

```bash
bun run eval:skill check                  # validate the inputs, no model
bun run eval:skill run                    # both arms, every scenario, pinned repetitions
bun run eval:skill grade .skill-evals/<batch> --grader claude   # or --grader codex
bun run eval:skill report .skill-evals/<batch>   # again, without grading; grade writes one too
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
of secondary text. All color definitions use OKLCH. `app.css` imports those tokens. The SVG
renderer paints with the tokens themselves (`var(--…)`, and `color-mix()`/`light-dark()`
of them), so a picture in the page takes the page's theme and a theme switch redraws
nothing. A standalone SVG or PNG is drawn for one theme and carries that theme's value of
every token it names on its root, resolved from the same declarations through Lightning
CSS as sRGB colors with their opacity. The shared file contains literal color custom
properties in `:root` and `:root[data-theme="dark"]`; keep layout values in
`app.css`. Unsupported cascade rules and unresolved colors are refused.

`archboard semantic render --theme light|dark` still needs no browser or frontend
build. Restart the Archboard server after editing the shared theme; rebuild the frontend
when serving its production bundle. The existing measured-text browser owner
also compares the built shell colors with standalone export colors in both themes.
