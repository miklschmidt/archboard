---
id: TASK-144.01
title: Pin the Tailwind and shadcn build dependencies
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:22'
labels: []
dependencies:
  - TASK-143.01.13
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - package.json
  - bun.lock
parent_task_id: TASK-144
priority: high
type: task
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root package.json/bun.lock seam for the accepted Tailwind/Base UI foundation. Pin every reviewed direct dependency needed by later TASK-144 leaves and audit the resulting transitive graph; assistant-ui is added only by the later serialized TASK-143.03.12.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exact dev dependencies are tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, and shadcn 4.19.0; exact runtime dependencies are clsx 2.1.1, tailwind-merge 3.6.0, and @base-ui/react 1.7.0.
- [x] #2 package.json adds one shadcn script invoking the pinned local CLI; no app code directly imports @radix-ui, assistant-cloud, registry runtime, class-variance-authority, lucide-react, tw-animate-css, AI SDK, second styling system, or speculative helper.
- [x] #3 Frozen Bun install, dependency/license inspection, type-check, frontend build, and bun run shadcn --help pass; an explicit reviewed transitive allowlist records unavoidable helper packages instead of asserting Radix or later assistant-ui transitives are absent.
- [x] #4 This root edit follows the exact Codex pin/conformance TASK-143.01.13 and precedes the separately serialized @assistant-ui/react TASK-143.03.12; no other ready leaf owns package.json or bun.lock.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the accepted Tailwind/Base UI dependency set and current root package seam against the reviewed adoption research, preserving the exact Codex 0.151.0 pin and existing scripts.
2. Add only the six exact reviewed direct dependencies and one shadcn script using the pinned local CLI; regenerate bun.lock without introducing later assistant-ui or speculative styling/runtime packages.
3. Audit the complete transitive dependency and license graph, record the explicit unavoidable helper allowlist in the task evidence, and challenge forbidden Radix/assistant/cloud/registry/helper additions.
4. Prove frozen install, bun run shadcn --help, both TypeScript projects, frontend build, lint, format, repository/module gates as relevant, diff, and clean status without touching application code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7023de7: exact newly ready scoped leaves are TASK-143.01.18 and TASK-144.01. They are path-disjoint: one repository-policy owner versus the serialized package/lock seam. TASK-143.01.16 remains an active timing remediation and TASK-143.01.07 is in read-only review, so three leaf-worker slots are occupied after dispatch. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; other scoped entries are parent containers or dependency-blocked, and TASK-141/TASK-142 are unrelated CI-restoration bugs.

Implementation evidence (2026-08-31, corrected after fixed-range review).

What changed:
- Added exact runtime pins: @base-ui/react 1.7.0, clsx 2.1.1, and tailwind-merge 3.6.0.
- Added exact dev pins: @tailwindcss/vite 4.3.3, shadcn 4.19.0, and tailwindcss 4.3.3.
- Added exactly one script, "shadcn": "shadcn", which resolves the project-local pinned binary through the package script PATH.
- Preserved @openai/codex 0.151.0 and every existing script and direct dependency.

Dependency graph and license audit:
- Reproducible Bun 1.4.0 comparison reports BASE with 549 lock entries and 519 unique package specs, and HEAD with 816 lock entries and 777 unique package specs. The newly reachable set is exactly 258 unique specs.
- Root contribution accounting over the HEAD lock graph is exact: @base-ui/react reaches 9 new specs, clsx 1, tailwind-merge 1, @tailwindcss/vite 43, shadcn 211, and tailwindcss 1. Eight specs are shared by exactly two roots, 250 belong to one root, their union covers all 258 new specs, and uncovered count is zero.
- The lockfile adds 267 keys, changes 9 pre-existing root selections, removes none, and adds 17 nested keys for specs already present at BASE. The changed selections are @babel/runtime, @floating-ui/core, @floating-ui/dom, @floating-ui/react-dom, @floating-ui/utils, clsx, isexe, use-sync-external-store, and which. Older compatible versions remain nested where required.
- The explicit accepted root-transitive allowlist is recorded from the lock manifests:
  - @base-ui/react: @babel/runtime, @base-ui/utils, @floating-ui/react-dom, @floating-ui/utils, and use-sync-external-store; @base-ui/utils also requires reselect.
  - @tailwindcss/vite: @tailwindcss/node, @tailwindcss/oxide, and tailwindcss. The node compiler brings @jridgewell/remapping, enhanced-resolve, jiti, lightningcss, magic-string, and source-map-js. Oxide and LightningCSS bring their platform-specific native packages, including the Linux x64 binaries used here and the other lockfile-supported platform variants.
  - shadcn: @babel/core, @babel/parser, @babel/plugin-transform-typescript, @babel/preset-typescript, @dotenvx/dotenvx, @modelcontextprotocol/sdk, @types/validate-npm-package-name, browserslist, commander, cosmiconfig, dedent, deepmerge, diff, execa, fast-glob, fs-extra, fuzzysort, kleur, open, ora, postcss, postcss-selector-parser, prompts, recast, socks, stringify-object, tailwind-merge, ts-morph, tsconfig-paths, undici, validate-npm-package-name, zod, and zod-to-json-schema. Their lockfile descendants are admitted only as required by these pinned tool manifests.
- bun pm licenses --json inspected all 662 installed instances: 549 MIT, 58 ISC, 19 Apache-2.0, 13 BSD-3-Clause, 5 BSD-2-Clause, 6 MPL-2.0, 2 BlueOak-1.0.0, 2 CC0-1.0, 1 each 0BSD, CC-BY-4.0, Python-2.0, Unlicense, and MIT AND Zlib, plus 1 (MPL-2.0 OR Apache-2.0) record for dompurify 3.4.14. Bun reported 2 Unknown records: backlog.md-linux-x64 1.50.1 and khroma 2.1.0. Both package manifests omit license metadata, but their shipped LICENSE/license files contain MIT license text, so they are closed as MIT with the metadata omission recorded.
- @radix-ui packages are present in the graph because the pre-existing @excalidraw/excalidraw 0.18.1 manifest directly requires @radix-ui/react-popover 1.1.6 and @radix-ui/react-tabs 1.0.2. This change does not add direct Radix packages and does not claim that all Radix transitives are absent. assistant-ui and its future transitives remain owned by the separately serialized TASK-143.03.12.
- bun pm why confirmed @base-ui/utils comes only from @base-ui/react, @radix-ui/react-popover comes from Excalidraw, and tailwind-merge is direct plus shadcn-internal. class-variance-authority is absent from the lockfile.

Validation:
- The reproducibility script passed the exact 258-spec set, root contribution, overlap, uncovered, key-addition, changed-selection, nested-key, and no-removal assertions above.
- bun install --frozen-lockfile passed with no changes.
- bun run shadcn --help passed and printed shadcn 4.19.0 CLI help.
- bun run type-check passed for root and frontend TypeScript projects.
- bun run build passed.
- bun run lint passed.
- bun run fmt:check passed on 519 files.
- bun run test:repository passed 130 tests and 415 expectations.
- bun run test:modules passed 1,010 tests and 7,034 expectations.
- git diff --check passed.
- A first repository run overlapped the module lane and hit a cleanup timeout; the prescribed serial rerun passed.

Scope audit:
- The implementation changes were limited to package.json and bun.lock while the same commit also recorded initial task evidence. This remediation changes only this TASK-144.01 note through the Backlog CLI.
- No application code, config, CSS, components, CI, alternate lockfile, or test changes were made.
- The pre-existing untracked src-DlBR1tzg.js was preserved.

Parent integration at 6aa7c3c preserved the exact six direct pins and local shadcn script. Independent fixed-range review returned REVIEW_CLEAN after reproducing the 258-spec transitive graph and complete 662-package license inventory. Integration validation passed bun install --frozen-lockfile, shadcn help, both TypeScript projects, Vite frontend build, Oxlint, Oxfmt, repository policy 130/415, module lane 1013/7046, and diff/status checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned the reviewed Tailwind 4, shadcn, Base UI, clsx, and tailwind-merge foundation without adding application code or later assistant-ui dependencies. Recorded the exact transitive and license audit, passed independent review, and verified the frozen install, local CLI, type-check, frontend build, lint, format, repository, and module gates on the integration branch.
<!-- SECTION:FINAL_SUMMARY:END -->
