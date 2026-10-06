---
id: TASK-367.21
title: 'Code facts for Nix flakes: inputs and outputs'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 16:36'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 629000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nix tells nothing about run time, but it shows software dependencies that no other file makes explicit. A flake's inputs are pinned in `flake.lock`, which is JSON. Its outputs are the packages, shells, overlays and system configurations it builds. The check never evaluates Nix, because evaluation can fetch from the network and run code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The inputs in `flake.lock` are build dependencies of the flake
- [x] #2 The outputs in `flake.nix` are definitions addressed by attribute path, such as `packages.x86_64-linux.archboard`, found by a static parse
- [x] #3 A part bound to a flake output gets the binding check, and a relationship to a flake input is supported by the lock
- [x] #4 The check never runs `nix`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: this repository has no flake.nix, so no dogfood board binds one. Archboard server@TASK-367.21 only if the Code facts description must change (it names the adapter table; Nix is one more entry), adopted at close.
1. New files in src/runtime/code-facts/lib: nix.scm (ERROR captures against tree-sitter-nix 0.3.0 from @lumis-sh/wasm-nix 0.26.3); nix-evaluation.ts, a static reading of Nix values that never evaluates Nix: attribute sets (rec too), let ... in, lambdas with a name or formals, application of the file's own lambdas, select, inherit, //, with, assert, and the library functions flakes use to fan out over systems (genAttrs, flake-utils eachSystem / eachDefaultSystem / eachSystemMap / defaultSystems, recursiveUpdate, flake-parts mkFlake with systems, perSystem and flake). Anything else is unknown, with its lines. nix-adapter.ts: the facts of flake.nix: each output as a definition addressed by attribute path (packages.x86_64-linux.archboard), down to the depth the flake schema gives each output; each input (declared under inputs, or a formal of outputs) as a definition inputs.<name>; an output the parse cannot follow is an unparsed part with the attribute path below which names are unknown. flake-lock.ts: the facts of flake.lock (JSON through JSON.parse, lines through a small key scanner): each input of the root node is a build-dependency reference inputs.<name> through an import; the resolver leads it to the subflake's flake.nix for a relative path input inside the checkout, else to its declaration in the flake.nix beside the lock.
2. Shared hunks: one entry in adapters.ts (name nix, whole names flake.nix and flake.lock); facts.ts: nix in AdapterName, build-dependency in Reference.kind, an optional under on Unparsed (the attribute path below which a static parse cannot tell the names); lookup.ts: a symbol below an under part is unparsed, never absent.
3. Tests: code-facts/tests/nix-facts.test.ts over inline fixture flakes (plain attrset, let ... in, forAllSystems with a literal list and with an unknown list, eachDefaultSystem, flake-parts, unknown shapes, a lock with path, github and follows inputs). code-check/tests/nix-check.test.ts: binding check on output-bound parts (held, missing, unknown skipped), a relationship anchored at a lock input supported, its kind judged, undrawn between bound parts, and a nix trap on PATH that the check never starts while reading a flake that would fetch if evaluated.
4. Try on public flakes cloned into scratch, through a temporary vault with output-bound parts; record in design-checks.md; authoring.md names flake outputs and inputs as binding symbols.
5. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Progress: nix-values.ts / nix-library.ts / nix-evaluation.ts (static reading), nix-adapter.ts (flake.nix outputs), flake-lock.ts (lock inputs and the resolver), nix.scm; one adapter entry 'nix' reading the whole names flake.nix and flake.lock; facts.ts: 'nix' in AdapterName, Unparsed.under; lookup.ts: a symbol below an under part is unparsed. Owners: code-facts/tests/nix-facts.test.ts (4 tests) and code-check/tests/nix-check.test.ts (3 tests), both green. Decision: no input definitions in flake.nix and no target to an input's declaration: an anchor or binding at the declaration would make an input part bound to its own repository look like ANCHOR_MISMATCH, and no criterion needs it; the lock is the evidence of an input.

Built (25e12eca3 code, f0222a83e docs, a72de6966 vault): src/runtime/code-facts/lib gains nix.scm, nix-values.ts, nix-library.ts, nix-evaluation.ts, nix-adapter.ts and flake-lock.ts; adapters.ts one entry nix reading the whole names flake.nix and flake.lock; facts.ts: nix in AdapterName, Unparsed.under (contract extension), and output as a Nix visibility word; lookup.ts: a symbol below an under part is unparsed, never absent, and a * name in a definition matches any one name. Owners: code-facts/tests/nix-facts.test.ts and code-check/tests/nix-check.test.ts. The code check needed no change for output-bound parts.

Decisions the ADR left open:
1. Only flake.nix and flake.lock are read. Every other .nix file stays text (TASK-367.22 decides derivation files).
2. Nothing is evaluated: a static reading follows attribute sets (rec too), nested names, inherit and inherit (from), let ... in, with, assert, the file's own lambdas (name or formals with defaults and @) applied to their arguments, select with or, lists, strings without interpolation, // and ++, and the library functions genAttrs, mapAttrs, foldl', recursiveUpdate, optionalAttrs, flake-utils eachSystem / eachDefaultSystem / eachSystemMap / eachDefaultSystemMap / defaultSystems, and flake-parts mkFlake (systems, perSystem's packages, devShells, checks, apps, formatter, legacyPackages, and flake). A library function is recognised by the last name of the selection (nixpkgs.lib.genAttrs) or a name with brings in, only where the file does not bind it itself. Unknown: import, builtins, if, input values, every other function. A budget of 200,000 steps and depth 400 ends a recursion as unknown.
3. Outputs are definitions to the depth the flake schema names them: 3 for packages, devShells, checks, apps, bundlers, hydraJobs; 2 for formatter, overlays, nixosModules, nixosConfigurations, darwin*, home*, flakeModules, templates and the legacy defaultPackage/devShell/defaultApp/defaultBundler; 1 for overlay, nixosModule, defaultTemplate; every name it can tell for any other output (lib). What a derivation or module holds is not an output. Visibility output, exposed true.
4. Unknown, never missing: an unknown value above schema depth, or an open set (// with an unknown side, a name from an interpolation it cannot tell, a flake-parts module with imports), adds an unparsed part with under = the attribute path (empty = every name). lookup treats a symbol spelled from that path, or not spelled from any first name the file defines (a tail that may lie below), as unparsed, so the check skips it as symbol-unparsed with the lines of the expression. A new skip reason would have been a change to src/shared/code-check, outside the fence, and symbol-unparsed already says the check could not read that code.
5. A list of systems it cannot read (lib.systems.flakeExposed, import systems, attrNames of an input) gives the name * standing for each system: packages.*.helix matches packages.x86_64-linux.helix. Without it 5 of the 6 real flakes left every per-system output unknown. A system the list does not hold reads as found: no false warning, a possible miss. flake-utils' defaultSystems are its four defaults even where a systems input changes them.
6. A name made outside the node that gives its set (each system of a forAllSystems written in a let) spans that node, so two outputs one helper makes do not share the helper's line.
7. flake.lock: each input of the root node is a reference inputs.<name>, kind build-dependency, at its key's line, through an import of its own whose specifier is the pinned source (github:NixOS/nixpkgs/nixos-unstable, path:./tools, follows:a/b). Inputs of inputs are not the flake's. Only a relative path input inside the checkout resolves (to its flake.nix); every other input reaches code outside the checkout. A lock that does not parse is one unparsed part with its words.
8. No input definitions in flake.nix and no target to an input's declaration: binding or anchoring at the declaration would make a part bound to the input's own repository read as ANCHOR_MISMATCH, and no criterion needs it. The lock is the evidence of an input; anchor at flake.lock with inputs.<name> (a bare name matches by last name).

Real flakes (scratch clones): helix ba40e54, ghostty c3203ea, home-manager 0e11b7b, disko 725ea35, nixvim 8fbc7d3, nixpkgs 9af746aa (flake.nix only). First flake.nix with grammar load 13 to 17 ms, others 0.4 to 4.2 ms, locks under 1 ms. Outputs: helix 13 (all), ghostty 34, home-manager 69, disko 89, nixvim 0 (flake-parts imports ./flake: every name unknown), nixpkgs 18. Temporary vault, 6 boards, 27 bound parts, 6 lock-anchored relationships, real checkCode 445 ms cold, 372 ms warm (git listing nixpkgs dominates). Findings, each right: BINDING_SYMBOL_MISSING on packages.x86_64-linux.hx-lsp (helix), nixosModules.readOnlyPkgz (nixpkgs) and devShells.x86_64-darwin.default (home-manager gives shells for four listed systems only); ANCHOR_MISMATCH information on a call anchored at the nixpkgs input; ANCHOR_SYMBOL_MISSING on inputs.flake-utils, which helix does not use; the anchors at inputs.nixpkgs, rust-overlay, inputs.zig and inputs.flake-parts support their dependency relationships; 6 parts skipped as symbol-unparsed (ghostty and disko checks, home-manager lib.hm.dag, nixvim's whole flake, nixpkgs legacyPackages.x86_64-linux.hello and lib.nixosSystem); every other part held.

Board: Archboard server@TASK-367.21 branched from JDl7Ci6C (TASK-367.20), Code facts description restated with the Nix adapter and shortened to fit the 2,000-character limit, summary set to the board's scope. check --code with and without --variant: no line differs. Footprint against base ceb91cd41: namedAndChanged Code facts (25e12eca3); changedNotNamed Code check (25e12eca3 adds only tests/nix-check.test.ts; the board stays true) and Archboard server / Code check route (e8823cf51, TASK-367.17); namedNotChanged none; 5 drill-down parts skipped. Adopted at version 112; ./bin/dogfood check: no diagnostics. The vault commit carries only this adoption, not the drafts of TASK-367.09 and TASK-367.17.

TASK-367.22 plugs into nix-evaluation.ts: a derivation's argument set (buildInputs, nativeBuildInputs, propagatedBuildInputs) reads as lists of values; a select such as self.packages.${system}.foo or final.foo reads to an attribute path. It adds build-dependency references from inside an output's span to the output they name, and an unparsed part (under) where it cannot follow.

Gate (lanes one at a time, after a72de6966): lint first exit 1 only on another agent's transient debug file src/runtime/code-facts/tests/zz-debug-11.test.ts (no-console), rerun after it was gone: exit 0; fmt:check first exit 2 on the same file, rerun: exit 0; type-check 0; build:frontend 0; test:modules 4192 pass 1 fail: semantic-renderer/tests/wide-boards.test.ts 'Archboard server (track)' first layout 5.1 s over its 3 s bound at load average 14. Not this task: the variant that was current before this adoption (TASK-367.20) lays out in 6.0 s cold against 4.4 s for TASK-367.21 in the same process; test:system 195/0; test:repository 20/0; test:serial-browser exit 0. Owners nix-facts + nix-check 7/0, code-facts + code-check 106/0 with --isolate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check now reads Nix flakes statically: the inputs of flake.lock are build dependencies of the flake, and the outputs of flake.nix are definitions by attribute path, found by a bounded reading that follows sets, let, with, inherit, the file's own functions and the common library helpers (genAttrs, flake-utils, flake-parts), and leaves what it cannot follow unknown under its own skip, never missing. A part bound to a flake output gets the binding check, and an anchor at a lock input is resolved evidence. The check never runs nix. Verified by nix-facts.test.ts (including six bound fixtures that once crashed or exhausted memory) and nix-check.test.ts with a spy on every process start (pass with --isolate), and on ten real flakes.
<!-- SECTION:FINAL_SUMMARY:END -->
