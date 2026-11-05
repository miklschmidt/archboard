---
id: TASK-579.07
title: The compiled executable runs the CLI and the server from outside any checkout
status: Done
assignee:
  - '@claude'
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T16:33:00Z'
labels: []
dependencies:
  - TASK-579.01
  - TASK-579.02
  - TASK-579.05
references:
  - packages/server-lifecycle/src/runtime/operations/spawn.ts
  - packages/renderer/src/runtime/services/bun-host.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1028000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`bun build --compile` bundles the CLI, but the server is spawned as `bun apps/server/src/server.ts`, and about ten files load by path or `import.meta.resolve`: the layout worker, grammar and core WebAssembly, tree-sitter queries, voice and workbench text and JSON, and `theme.css` through the native lightningcss addon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One executable runs the CLI, and with an internal first argument it runs the server
- [x] #2 Every file read by path loads from the installation module or from the executable, and no native Node addon loads at runtime
- [x] #3 From a directory outside any checkout, the executable with its assets runs `start`, `model read`, a render, `code check` and `stop`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. bin.ts: a release started with --internal-server imports the server entry the executable embeds (releaseServerModule); apps/server/src/server.ts starts unconditionally (import.meta.main is false for an embedded entry imported by the executable; isMainModule removed).
2. installation: programModule(checkoutPath) gives the URL of a module that starts on its own (server, layout worker): checkout root, or the root of the executable's embedded file system (dirname of Bun.main). grammarsDirectory removed (grammars are embedded).
3. Embed with Bun import attributes, one code path in both modes: tree-sitter grammar .wasm and web-tree-sitter.wasm (type file), .scm queries, voice and workbench reviewed .txt/.json (type text).
4. Theme colours: bun run build:core writes theme-colors.json beside the core (theme.css is a core source); bun-host reads it from installation().coreDirectory, so lightningcss loads only at build time.
5. scripts/release/compile.ts --target <bun-target> --out <dir>: compiles bin.ts + server.ts + layout worker with the repository as root, refuses native addons, lays out bin/ frontend/ core/ skills/ archboard-release.json.
6. Prove: release-executable system test, and the manual proof outside any checkout.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 75d101745, 5a4fa98cc and 4836c89ac.

Design and decisions:
- scripts/release/compile.ts --target <bun target> --out <dir> compiles one executable. Its entries are apps/cli/src/bin.ts, the server entry and the layout worker. The repository is the build root.
- The release serverCommand is [executable, --internal-server]. When bin.ts gets those arguments in a release, it imports installation().serverModule and runs no command. spawn.ts did not change.
- An entry that the executable imports is not import.meta.main, and isMainModule does not match it either. So apps/server/src/server.ts now starts the server unconditionally. Nothing imports it. isMainModule had no other caller, so it is removed.
- The installation has two new fields. programRoot is the checkout root, or the root of the embedded file system (the directory of Bun.main) in a release. serverModule is the URL of the server entry below it. The layout worker starts from its checkout path below programRoot. Fields add no exported name. grammarsDirectory is removed, because no code reads grammars by path now.
- Bun import attributes embed these files, with one code path for both modes. The grammar .wasm files and web-tree-sitter.wasm use type file. The .scm queries use type text. The table is grammar-files.ts.
- The voice and workbench texts and JSON templates use type text. Their bytes are still checked against the reviewed hashes. TypeScript types a JSON import as its value, so a run-time typeof check proves the text.
- readWorkbenchInstructionDocument of the voice package now takes the text, not a URL. This changes a public MIT API. The voice pack now uses loader for .json and .txt. It no longer copies src/ assets or publishes the # import map.
- bun run build:core writes generated/core/theme-colors.ts from theme.css, beside types.ts and marks.ts. The Bun host imports it. So no host loads the Lightning CSS addon, and the executable embeds the colours. A stale theme is refused with the core, as before.
- A Bun macro was tried first. Bun refuses a macro in a file that it reaches through node_modules, and local-bind.test.ts does that through a symlinked checkout.
- The release core/ holds the glue, bundled with its panic guard, and the WebAssembly.
- The compile refuses a bundle that loads a native addon. It looks for .node inputs, and for packages with a <name>-* sibling that holds a .node file. A test import of read.ts made it refuse lightningcss.
- The executable does not load bunfig.toml or tsconfig.json. It loads .env as a checkout does.
- The bun-linux-x64 executable is 145,209,520 bytes. The embedded grammars are about 24 MB. The package is 169 MB without Codex.

Proof, outside any checkout:
- PATH was /run/current-system/sw/bin, with no bun, node or cargo. XDG_STATE_HOME and CODEX_HOME were scratch directories.
- The real Codex package was copied to node_modules/@openai/codex-linux-x64 beside the package.
- The scratch git repository held a Go module. The marker recorded commit 4836c89ac and core hash c1ec34263a4f6827.
- archboard --version printed 0.1.0, exit 0.
- archboard start printed: running at http://archboard.localhost:27242, exit 0. /health gave version 0.1.0 and mode release.
- archboard install-skill --dir <scratch> linked both skills and made the vault, exit 0.
- model read, model claim and model edit all exited 0. The edit made proposal Shop with modules Shop, Store and Ghost.
- model read --state Shop listed the three modules and one relationship, exit 0.
- model render --state Shop --out shop.svg wrote a 592 by 259 SVG, exit 0.
- check code --state Shop gave one warning, BINDING_SYMBOL_MISSING for Ghost (symbol Load). The Go grammar found Save for Store. Exit 1, as the warning requires.
- archboard stop exited 0, and status then said running false. Port 3000 was not touched.

Gate, inside nix develop:
- types, lint:all and format:check pass.
- test:modules: 4929 pass, 1 skip, 0 fail.
- test:system: 234 pass, 1 fail. test:repository: 162 pass, 1 fail.
- Both failures exist on f297dd2d2 before this work. voice-package.test.ts:100 finds Archboard words that TASK-579.05 put in codex-app-server. The interface width test finds workspace at 42 (TASK-579.01) and skills at 4 (TASK-579.06).
- This work adds no exported name to workspace or renderer, and removes one from server-lifecycle.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
In a release, apps/cli/src/bin.ts runs the server when started with installation().serverCommand ([exe, --internal-server]) by importing installation().serverModule; apps/server/src/server.ts starts unconditionally. Grammar and tree-sitter wasm, queries, voice and workbench texts are embedded module imports; theme colours are generated at core build time (generated/core/theme-colors.ts), so lightningcss runs only at build time; the release core/ holds the glue bundled with its panic guard. scripts/release/compile.ts compiles a target and lays out bin/, frontend/, core/, skills/ and archboard-release.json, and refuses a bundle that would load a native addon. Executable 145 MB (linux-x64). Proof: tests/system/process-contracts/release-executable.test.ts passes on fix/core-build-feedback, and a manual run with PATH=/run/current-system/sw/bin ran --version, start (http://archboard.localhost:27242, /health mode release), install-skill, model read/claim/edit, render to SVG, check code and stop. Full `bun run check` exit 0 after merge. The voice package API readWorkbenchInstructionDocument now takes text (breaking for the MIT package).
<!-- SECTION:FINAL_SUMMARY:END -->
