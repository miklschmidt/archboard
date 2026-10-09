---
id: TASK-436.06
title: The code check follows imported .nix files inside the checkout
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:35'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 754000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads only `flake.nix` and `flake.lock`, so it cannot follow `callPackage ./pkg.nix` into another file. Most real flakes build that way, so most of their relationships are skipped. The owner decided to follow such files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The code check follows a `callPackage` or an `import` of a `.nix` file inside the checkout, within the limit of 200,000 evaluation operations
- [x] #2 A file outside the checkout, or an evaluation past the limit, still gives the skip with the file and the lines
- [x] #3 The notes say, for the 16 flakes of TASK-367.22, how many relationships go from skipped to supported
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected: the Code facts part on Archboard server retains its existing directory binding and static Nix-reading responsibility; the parent confirmed this before implementation.
1. Add a checkout-scoped Nix source loader that follows literal local paths (including directory/default.nix), rejects outside/unlisted/forbidden targets through the pass read boundary, and owns imported trees for one reading.
2. Keep one 200,000-operation budget for the flake and every imported expression; follow import and callPackage with explicit arguments and the caller package scope without running Nix. Preserve the flake ownership span and report imported file/lines for unknown inputs.
3. Add focused observable-contract tests for imported build dependencies, relative nesting, arguments/defaults, symlink/outside rejection, shared budget, and imported edits across passes.
4. Rerun the 16 pinned TASK-367.22 flakes and compare skipped relationship support; record evidence and limitations. Simplify, run focused gates, and commit Refs TASK-436.06. Leave In Progress for the parent closing gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented safe checkout-scoped local import and callPackage evaluation, including directory/default.nix and nested relative imports, within one 200,000-operation budget. Explicit arguments override automatic package-scope formals; when the package function is readable only actual build inputs count. Unreadable sources preserve explicit inputs and skips. Outside paths, outside links, import cycles, unsupported expressions and spent budgets remain unknown. Imported source file/lines are preserved for both binding and relationship skips while ownership remains the flake output. Each pass reparses a flake with its imports so imported edits cannot hide behind the flake-content cache.
Validation: 253 focused Nix/code-check and skill-evaluation tests passed across 34 files, targeted production/test lint passed, root tsc --noEmit passed with the coordinated .15 facts contract applied locally, and skill artifacts regenerated. Main node_modules is shared; the Codex generator refuses that symlink by design, so ignored generated contract artifacts were copied from main for type checking. No tracked generated files.
Exact-pin measurement across all TASK-367.22 flakes: nixd bdb4670 0; deploy-rs cf64c8c 0; nix-index dd6792b 0; helix ba40e54 0; devenv fe20b5c 0; nixvim 8fbc7d3 0; treefmt-nix 03d8ee1 0; crane 47b6b27 0; rust-overlay b962e5d 0; Nix bea853d 0; lanzaboote ba33415 0; Hydra 6e99f07 0; nil 205c8ba 0; microvm.nix 52860fa 0; fenix eff70f3 0; attic 7a19204 0 relationships changed from skipped to supported. No supported relationships were lost; nixd retains four logical sibling-output dependencies. Seven flakes expose additional output definitions. Every real source was available.
The original six-board/21-part/11-relationship real check retains one supported relationship, two resolved undrawn warnings and ten relationship skips; three skip sites now point into imported files. Baseline 395/374 ms cold/warm; final candidate 356/327 ms. Single runs establish no speed improvement. Remaining dependencies require outside nixpkgs scopes or unsupported builders such as mkShell/overrideAttrs. Per-flake definitions and limits are recorded in docs/design/design-checks.md. Consumer authoring reference and runtime evidence-owner coverage updated.
Simplification: reused the existing checkout read boundary and Nix grammar; local source ownership and lifetime have one owner, nix-files.ts. No new public scanner interface or code-check mode. No board changes: the existing Code facts role and directory binding still describe this mechanism. Left In Progress for parent review and complete gate.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Static Nix evaluation follows imports and callPackage inside the checkout with one 200,000-operation budget. Focused import tests and the complete gate pass. All sixteen pinned flakes retain prior dependencies and gain zero supported relationships. Seven expose more definitions.
<!-- SECTION:FINAL_SUMMARY:END -->
