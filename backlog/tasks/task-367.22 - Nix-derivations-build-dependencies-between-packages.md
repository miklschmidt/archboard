---
id: TASK-367.22
title: 'Nix derivations: build dependencies between packages'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 19:58'
labels:
  - code-check
dependencies:
  - TASK-367.21
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 630000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inside a flake, a derivation names the packages it is built from. When those packages are other outputs of the same flake or overlay, the dependency between two parts is explicit only here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `buildInputs`, `nativeBuildInputs` and `propagatedBuildInputs` that name another package of the same flake or overlay are build dependencies
- [ ] #2 Build dependencies between bound parts that the board does not draw are reported as in the undrawn check
- [ ] #3 Expressions the static parse cannot follow are reported as unknown, never as missing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: this repository has no flake.nix, so no dogfood board binds one; Archboard server@TASK-367.22 only if the Code facts description must change (it names the Nix adapter's reading), adopted at close.
1. Split nix-evaluation.ts (598 lines) along the seam between reading expressions and the structures a reading builds: scopes and sets being built move to nix-scope.ts. curried/unary move to nix-values.ts so a new module can make library functions without a cycle.
2. List items carry their node (Entry), so an input has a line. An unknown value may carry what a derivation is built from: derivation { inputs, unfollowed }.
3. nix-derivations.ts: the call shapes that count as a derivation, recognised by last name like the library functions (only where the file does not bind the name): mkDerivation (stdenv.mkDerivation, with a set, rec set or finalAttrs function), buildGoModule, buildPythonPackage, buildPythonApplication, buildRustPackage (rustPlatform.buildRustPackage), and callPackage with an argument set (the values of the set are inputs; the package file is not followed, so its inputs are open). Inputs: buildInputs, nativeBuildInputs, propagatedBuildInputs. Every step spends from the reading's budget.
4. nix-adapter.ts: self is the flake's own outputs; an overlay (overlays.<name>, overlay) is applied to final (its own result over an unknown prev) and its packages are definitions overlays.<name>.<package>; an unknown name selecting from a set of only '*' takes '*' (self.packages.${system}.lib under eachDefaultSystem). After the walk, each leaf output's derivation inputs are matched by value to the outputs of the flake: a reference of kind build-dependency to that output, through an import 'self' that the flake resolver resolves to the file itself, at the input's line (or the output's first line when the input is written outside its span). An inputs list or item the reading cannot follow, and a leaf output that is no derivation the reading recognises, is an unparsed part with no names (inert for lookups) at those lines.
5. code-check: evidence.ts collects, for each part, the unparsed parts of the Nix files in its code; relationships.ts skips a relationship with no anchor whose kind accepts build-dependency, that no accepted evidence supports and whose start's code holds such a part, as expression-not-followed with file:lines, never RELATIONSHIP_UNSUPPORTED.
6. Tests: code-facts/tests/nix-build-dependencies.test.ts (packages.<system>.app from packages.<system>.lib, overlay final.lib, callPackage ./pkg.nix {} not followed, a let binding, eachDefaultSystem); code-check/tests/nix-check.test.ts: undrawn build dependency, supported relationship, unfollowed start skipped.
7. Real flakes in scratch (nixd, deploy-rs, nix-index, helix, devenv, nixvim, treefmt-nix, crane, NixOS/nix) through a temporary vault with output-bound parts; record in design-checks.md; authoring.md.
8. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Progress (c611b5ffa refactor split, c21047776 feature): nix-scope.ts holds scopes and sets being built (nix-evaluation.ts 598 -> ~500 lines); nix-derivations.ts recognises derivations; nix-build-inputs.ts matches inputs to outputs; adapter: self, overlay packages, leaves; flake resolver resolves specifier self to the flake itself; code-check evidence.ts notes per part the unparsed parts of Nix files in its code, relationships.ts skips an unsupported relationship from such a start as expression-not-followed.

Decisions:
1. Call shapes that count as a derivation (recognised by last name, like the library functions, only where the file does not bind the name): mkDerivation (stdenv.mkDerivation, stdenvNoCC...), buildGoModule, buildPythonPackage, buildPythonApplication, buildRustPackage (rustPlatform.buildRustPackage), each with a set, rec set or finalAttrs function; callPackage f args, whose explicit args are inputs and whose package function (file or inline) is never followed, so its inputs are always open. mkShell, buildEnv, symlinkJoin, overrideAttrs, override and composeExtensions are not derivations the reading recognises: their outputs' inputs are unknown. Only the three attributes buildInputs, nativeBuildInputs, propagatedBuildInputs are build inputs (not inputsFrom, packages, src, or string interpolation).
2. Matching is by value identity, never spelling: self.packages.${system}.lib, a let binding, inherit, final.lib and a callPackage argument all reach the output whose value it is; every output holding that value is named (an alias such as packages.default = nixd gets its own reference). Only values the reading cannot follow as a set (unknown, which every derivation is) are candidates, so a string or path never matches.
3. self is the outputs, opened so that no name of self is surely absent (Nix adds rev, outPath...). An unknown name (a system under eachDefaultSystem) selects * from a set whose only name is *.
4. Overlays: overlays.<name> and overlay are applied to prev (names unknown) and final (prev // what the overlay adds); the packages are definitions overlays.<name>.<package>, one level below the schema depth. prev.x is never the overlay's own package: like a nixpkgs package, it is unknown. An overlay the reading cannot follow (import, composeExtensions) leaves the names below it unknown (under), so overlays.default.x is skipped, not missing.
5. Unknown, never missing: an input value the reading cannot follow (pkgs.openssl, prev.x, import), an input list it cannot read, callPackage's package function, the budget running out, and a leaf output that is no recognised derivation are each an Unparsed part with no names and no under, at the expression's lines, or the output's span where the expression is outside it. Such a part hides no name (lookup ignores it), and the code check reads it as: the build inputs of the code there are unknown. I chose not to change facts.ts (outside the fence); a part with no names already means nothing to lookup.
6. Attribution: a reference is at the line where the input is named when that lies inside the depending output's span, else at the output's first line (a package a let builds). A derivation that is no output (a let-bound helper) passes on its inputs, at the line where the output names the helper.
7. Spans: a name written by a binding or an inherit spans its own lines wherever it is written; only a name an expression makes outside the set's node (genAttrs in a let) spans the set's node. Before this, flake-utils' packages.a/packages.b and flake-parts' inherit-ed packages all spanned the first binding, so one package's inputs read as every package's. Each inherited name spans its own identifier.
8. Code check: only an unsupported relationship (no accepted evidence) whose kind accepts build-dependency and whose start or a part inside it holds such a part is skipped as expression-not-followed, detail '<part>: flake.nix:<lines>'. RELATIONSHIP_BACKWARDS stays: Nix builds are acyclic. Only Nix files' unparsed parts count, so other languages are unchanged.
9. Budget: one step per input read, one per output an input names (an alias of 3,000 outputs costs 3,000), plus what evaluation spends.

Board: no proposal. This repository has no flake.nix, so no dogfood board binds a Nix output; the Archboard server board's Code facts description already names build dependency as an evidence kind and its Code check description says it lists what it skipped and why. The task adds files inside src/runtime/code-facts and changes code inside src/runtime/code-check, which those parts bind as directories; no part, relationship or description changes.

Real flakes (scratch clones, t367-22-flakes): nixd bdb4670, deploy-rs cf64c8c, nix-index dd6792b, helix ba40e54, devenv fe20b5c, nixvim 8fbc7d3, treefmt-nix 03d8ee1, crane 47b6b27, rust-overlay b962e5d, NixOS/nix bea853d, lanzaboote ba33415, hydra 6e99f07, nil 205c8ba, microvm.nix 52860fa, fenix eff70f3, attic 7a19204. flake.nix read in 14 ms with grammar load, 0.4-4.8 ms each other. Only nixd writes build dependencies between its own packages in flake.nix (callPackage ./nixd { inherit nixComponents nixf nixt; }): 6 references (nixd -> nixf, nixt at its inherit line 73; default, which is nixd, -> nixf, nixt at line 67; the nvim/vscodium shells -> nixd and default at line 86). Every other flake builds packages through callPackage of files or import nixpkgs with overlays: unknown.
Temporary vault (6 boards: nixd, helix, deploy-rs, nix-index, microvm.nix, nil; 21 output-bound parts; 11 unanchored dependency relationships), real checkCode 362 ms cold / 320 ms warm. Before this task (same vault, code at c611b5ffa^): 9 RELATIONSHIP_UNSUPPORTED information and 3 BINDING_SYMBOL_MISSING (overlays.helix.helix, overlays.default.deploy-rs, overlays.default.nil, then not outputs). Now: nixd -> nixf supported; 4 RELATIONSHIP_UNDRAWN warnings, resolved and right (nixd and default built from nixf and nixt; the editor shells from nixd/default); 10 relationships skipped expression-not-followed with the output and lines (callPackage files, import nixpkgs with overlays, overrideAttrs, mkShell); overlays.helix.helix and overlays.default.deploy-rs hold; overlays.default.nil skipped (lib.composeExtensions is not followed), not missing.

Independent review (2026-10-06) of c611b5ffa, c21047776 and 94b3f5b32. Verdict before the fixes: NOT CLEAN. Fixes: b1a70987d (code facts), 8570210f6 (check), 3c78429fb (docs).

Finding 1, must-fix: false resolved RELATIONSHIP_UNDRAWN warnings (nix-build-inputs.ts, dependsOn). The check gives a piece of evidence to every part whose output holds the line of the reference. It takes the evidence to every part whose output holds the lines of the target. Several packages can share one line. Examples: `inherit core lib app;` on one line, as devenv writes `inherit (workspace.crates) devenv devenv-tasks;`. Also a set on one line, `inherit (x) a b;`, flake-parts `packages = { inherit lib tool app; };`, an overlay that inherits from self.packages, the outputs of one genAttrs call, and a mapAttrs over the packages. A probe vault through the real checkCode gave 13 false warnings over 5 such flakes, such as core built from lib. Fix: a reference stands only where no other package holds its line or the lines of its target. The same package under another name (same value) can share them. So can the same name for another system (SYSTEM_AT, the system position of the flake schema). Elsewhere the inputs are unknown at that line. The outputs are indexed by line once, and each line of each output spends a step. Each comparison spends a step for each output that it compares, once for each output and lines. Owner: nix-build-dependencies.test.ts, "a line that two packages share". It fails on the old code. Cost: one genAttrs call gives the nixd editor shells nvim and vscodium, so they share its lines. Their dependency on nixd is now unknown. The 6-flake trial finds 2 right undrawn warnings instead of 4.

Finding 2, must-fix: the skip was too broad and changed other languages (relationships.ts notFollowed, evidence.ts noteUnfollowed). Every flake holds an expression that the reading cannot follow, such as mkShell or a nixpkgs input. So a part bound to a directory that holds a flake skipped every unsupported dependency from it, also TypeScript to TypeScript. The same checkout without the flake gave RELATIONSHIP_UNSUPPORTED. A relationship from a package to a TypeScript file was skipped too. A build dependency in a flake reaches only the outputs of that flake. So the skip now needs the end, or a part inside it, to hold the same flake file. The evidence notes each Nix file for each part, by repository and path. It marks the owners of every line of the expression, not only of its first line. Owner: nix-build-check.test.ts e4, from the ui directory beside a flake with a shell to TypeScript in api. It is unsupported, and it fails on the old code.

Finding 3, fixed (criterion 3): an input that is a set merged with a value that the reading cannot follow (`pkgs.hello // { ... }`) was left out. A string that an interpolation makes was left out too. So a right relationship read RELATIONSHIP_UNSUPPORTED. Now such an input is unknown. Owner: cli in the shared fixture, line 17.

Finding 4: the comment on expression-not-followed in src/shared/code-check/index.ts now also tells the relationship skip and its detail (part: file:lines).

Finding 5: design-checks.md now records the review and the nixd numbers. authoring.md tells that a shared line leaves the inputs unknown, and that the skip needs an output of the same flake.

Checked and clean: the Nix modules import no cycle (values, derivations, library, scope, evaluation and adapter, with build-inputs under adapter and flake-lock). The split moved the code as it was, and list items became entries. Lint holds every file under 600 lines and complexity 6. These gave no false evidence: rec sets, let shadowing, `with pkgs;` (lexical names first), finalAttrs, an overlay that uses a name of prev (prev.hello is never the overlay's), an alias (default = nixd), eachDefaultSystem, eachSystem with a list, forAllSystems written with genAttrs, flake-parts perSystem (self' and config are unknown and never match), two callPackage calls of one file with other arguments, two mkDerivation calls with one pname, string and path inputs, and `checks = self.packages`. An overlay that the reading cannot follow (import, composeExtensions, `// import`) leaves the names below it unknown: nil's overlays.default.nil is skipped. Not changed: a literal input of another system (`self.packages.aarch64-linux.lib` in an x86_64 package) lands on the part bound to lib for the system of the board. The relationship that a right board draws (built from lib) clears it. An anchor at flake.nix holds for any output of an end. That is the general anchor rule.

Probes, one real checkCode pass each: 100,000 inputs 307 ms (one line) and 242 ms (own lines). 5,000 aliases 171 ms. A helper chain 5,000 deep with 2,000 leaves 222 ms. A callPackage chain 3,000 deep 162 ms. 300 nested overlays 308 ms. Recursion through self 86 ms. A list doubled 40 times 90 ms. 5,000 leaves built from lib 255 ms. 300 chained leaves 102 ms. Real flakes: the 6-flake vault (nixd, helix, deploy-rs, nix-index, microvm.nix, nil) took 368 ms cold and 316 ms warm, with 2 right undrawn warnings, 10 skips and no false finding. 5 more flakes (Nix with forAllSystems and flake-parts, devenv, Hydra, attic with flake-parts, lanzaboote) took 330 and 292 ms, with 12 skips and no finding.

Gate after the fixes, lanes one at a time: lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 4268 pass 0 fail, test:repository 21 pass 0 fail. test:system first gave 100 pass 33 fail and test:serial-browser 0 pass 1 fail: the Archboard server did not start, because the uncommitted work of TASK-367.10 in the shared tree imported readingHeaders, which objc-adapter.ts did not export then. The rerun once that tree was whole: test:system 195 pass 0 fail, test:serial-browser exit 0. The Nix owners (nix-facts, nix-build-dependencies, nix-check, nix-build-check) 15 pass 0 fail with --isolate.
<!-- SECTION:NOTES:END -->
