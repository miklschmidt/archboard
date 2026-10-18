# Package map: from 110 modules to workspace packages

Status: proposal. No file moved yet. It is the input for the decision to replace
`src/<area>/<module>` and its `index.ts` barrels with workspace packages that
declare their interface in `package.json` `exports`.

## Why

A scan of `src` found 110 modules. 72 have one file at the root, 97 of the 99
`index.ts` files only re-export, and 24 modules have at most one importing module.
The name prefixes show the real modules: 32 start with `codex`, nine with
`workbench`, nine with `semantic`, seven with `code`, four with `walkthrough` and
four with `voice`. The area folders (`shared`, `runtime`, `server`, `ui`) cut each
of these in pieces. A caller must learn many small interfaces to use one
behavior.

## Target shape

A package owns one behavior. The area folders move inside the package, and the
area rules still hold there: a `ui` folder of a package never imports its
`runtime` or `server` folder. Each package names its public files in `exports`,
and a file that is not named is private. There is no `index.ts` barrel. A
package that serves both the browser and the server exposes one subpath for
each side, for example `@archboard/workbench/ui` and `@archboard/workbench/runtime`.
Lint refuses the server-side subpaths from browser code. This replaces the
`archboard/import-boundaries` rule for the module root.

```text
packages/<name>/
  package.json        # exports: the interface
  src/<area>/...      # private, areas are folders inside
apps/{cli,server,web} # process entrypoints and glue
```

## Map

| Package            | Takes in (current modules)                                                                                                                                                                               | About                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `board`            | shared/semantic-board, semantic-policy, ids, semantic-pane-context, repositories, code-target (the binding type only), runtime/semantic-board-store, semantic-board-client                               | The board document: model, policy, the one reader and writer.       |
| `renderer`         | transformers/semantic-renderer, runtime/semantic-renderer, semantic-rasterizer, headless-chromium, ui/browser-renderer, shared/shell-geometry, theme                                                     | Draw a board as a picture.                                          |
| `code-intel`       | runtime/code-facts, code-check, history-lens, language-servers, shared/code-check, language-servers, history-attribution, footprint, locality                                                            | What the code says about a board.                                   |
| `code-target`      | runtime/code-target, server/code-opener, ui/code-target, opener-settings, opener-settings-flow                                                                                                           | Open the code that a node binds.                                    |
| `walkthrough`      | shared/walkthrough-recording, runtime/walkthrough-recorder, video-encoder, ui/walkthrough-recording, walkthrough-replay                                                                                  | Record and replay a narrated walkthrough.                           |
| `codex-app-server` | shared/codex-app-server-contract (generated), codex-app-server-capacity, runtime/codex-protocol, codex-process, codex-transport, codex-session                                                           | One private app-server session over stdio.                          |
| `workbench`        | the other 18 runtime/codex-* modules, server/codex-workbench, shared/codex-browser-model, codex-browser-gateway, codex-workbench-identity, ui/workbench, workbench-*, agent-setup, codex-workbench-media | The coordinator, the workhorses and the conversation a person sees. |
| `voice`            | shared/codex-realtime-contract, runtime/codex-realtime, ui/codex-realtime, voice-orb, voice-session, voice-subtitles, voice-output-level                                                                 | Spoken input and output.                                            |
| `skills`           | runtime/skill-distribution, skill-evaluation                                                                                                                                                             | Ship the skills and evaluate them (human-run).                      |
| `timing`           | shared/timing                                                                                                                                                                                            | Every duration, with what it pulls against.                         |
| `ui-kit`           | ui/components, dialog-parts, frame-clock, fullscreen-presentation, repository-name                                                                                                                       | Shared presentation parts.                                          |
| `board-canvas`     | ui/semantic-board-canvas, variant-lifecycle, server-requests                                                                                                                                             | The viewer of one board.                                            |
| `apps/server`      | server/archboard, browser-origin, runtime/engine, shared/server-startup-terminal, shown-conversation, process-observation                                                                                | The server process.                                                 |
| `apps/cli`         | cli/command-contract, command-routing, commands, runtime/image-clipboard                                                                                                                                 | The command line.                                                   |
| `apps/web`         | ui/application, shell, board-catalog, board-move, board-routing, pane-session, vault-diagnostics, types, theme                                                                                           | The browser shell.                                                  |

That is 12 packages and three apps in place of 110 modules.

## Open points to settle before the first move

- `shared/thrown-error` has no owner yet. `board` and `apps/server` both use it.
- `runtime/semantic-board-store` and `runtime/engine` import each other. Find
  the real edge (type or value) and remove it before the split. If it stays, the
  packages form a cycle.
- `shared/code-target` is imported by the board model, but `runtime/code-target`
  imports the engine. The binding type goes to `board` and the resolver to
  `code-target`.
- `server/archboard` is 28,000 lines and imports 24 codex modules. It is the
  first thing to check for hidden depth that belongs inside `workbench`.
- Pilot with `codex-app-server` and `workbench`: they hold 41 of the 110
  modules and cross every area.
