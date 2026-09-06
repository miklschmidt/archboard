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
do not commit the derived skill copies or any PNG, SVG, manifest or exported
scene made as proof.

## 2. Pick a vault

Boards are `.excalidraw.md` notes in an Obsidian vault. There is no default
vault: set `ARCHBOARD_VAULT` before `./bin/canvas start`, because the server
does the vault I/O and refuses to start without one (ADR 0015). The browser at
<http://127.0.0.1:3000> is optional and only for a live human session.

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

Every board command names its board and every write says what it is doing;
the whole named-board workflow needs no browser:

```bash
./bin/canvas board new payments --level service
./bin/canvas add --board payments --doing "drawing the payment path" elements.json
./bin/canvas describe --board payments
./bin/canvas board save --board payments --variant option-a --doing "branching the proposal"
```

Mermaid conversion, rendering, `check`, snapshots, branches and exports work
the same way. The final note is at `$ARCHBOARD_VAULT/payments.excalidraw.md`;
prose you write above its `# Excalidraw Data` heading survives every save.

Only `browser` commands touch a live session (panes, selection, open, show,
viewport, capture); each names its pane and none writes the note. Pass selected
ids explicitly to a later named-board write.

## 6. Verify Codex semantic delivery

The module owners cover the
[bound app-server contract](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session);
the composition owner starts the application with its owned child, links a
workhorse and proves one human change is delivered while an agent-only change
stays silent:

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
