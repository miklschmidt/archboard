---
id: TASK-500.08
title: Codex protocol and process ownership are in the codex-app-server package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 03:14'
updated_date: '2026-10-19 03:54'
labels: []
dependencies:
  - TASK-500.07
parent_task_id: TASK-500
ordinal: 873000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The runtime half of the codex-app-server package: runtime/codex-protocol (schemas and decoders) and the rest of runtime/codex-process (process owner, storage, executable resolution, diagnostics). The process group files already live in the process package. runtime/codex-process/lib/executable.ts:143 finds the checkout-local Codex executable by walking four parents up from its own file, which breaks at a package path. It must use SOURCE_CHECKOUT from @archboard/workspace/source-checkout and keep refusing a global or foreign-checkout executable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 codex-protocol and the remaining codex-process files live in packages/codex-app-server in runtime/ role folders, every importer uses the package exports, and no forwarding barrel is left
- [x] #2 Executable resolution uses SOURCE_CHECKOUT and still refuses an executable of a global or foreign checkout, proven by its existing test
- [x] #3 The tests of the moved code live in packages/codex-app-server/tests, and the normal and opt-in test paths in package.json and ci.yml name the new locations
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move runtime/codex-protocol (index.ts, lib/*, tests) and the remaining runtime/codex-process (lib/*, entry files, testing.ts, tests) into packages/codex-app-server under runtime/ role folders chosen from the content: protocol schemas and decoder (shared if browser-used, otherwise runtime/protocol or schemas), process owner, storage and executable (processes, store, services), diagnostics and environment.
2. Remove the forwarding entry files (index.ts, process.ts, storage.ts, executable.ts, environment.ts, diagnostics.ts, testing.ts of codex-process; index.ts of codex-protocol). The exports point at the real files, with the minimum subpaths that outside code uses. A ./testing export only if tests outside the package need createCodexProcessForTesting and its types.
3. runtime/codex-process/lib/executable.ts resolves the project root by walking four parents up from its own file. Use SOURCE_CHECKOUT from @archboard/workspace/source-checkout, keep refusing an executable outside the checkout node_modules, keep the createRequire resolve of @openai/codex/bin/codex.js, and keep its tests green (they prove the refusals).
4. errno-code.ts in codex-process: replace by @archboard/diagnostics/errno where behavior is identical, delete the duplicate when no storage file needs it.
5. Tests move to packages/codex-app-server/tests/runtime/<role>/. package.json test paths (test:modules ignore patterns, opt-in) and .github/workflows/ci.yml name the new locations.
6. No @/ import in the package; the package depends on lower packages only. If a moved file needs a file that stays in src/, stop and report. Rewrite importers with /tmp/pm/move-package.ts, hand-fix reported strings, update docs/agents/boundaries.md and skills/archboard-dev/SKILL.md paths. bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
runtime/codex-protocol and the rest of runtime/codex-process are in packages/codex-app-server under runtime/processes, store, services, protocol and schemas, behind 13 new Node-side subpaths; the forwarding barrels and errno-code.ts are gone. Executable resolution uses SOURCE_CHECKOUT, and two new tests prove the refusal of a global, nested foreign and sibling-prefix checkout, which no test proved before. Browser safety: only six shared files reachable, 0 node: imports, traced by the implementer and by Codex. bun run check passed. Codex review of 47b3072c7 found no defects; its two doc nits (runtime exports are not all Node-bound; the count that becomes private in task 09) are fixed there. Advice kept for task 09: make protocol-methods, request-schemas, response-schemas and thread-schemas private and merge the remaining schema needs into a session contract.
<!-- SECTION:FINAL_SUMMARY:END -->
