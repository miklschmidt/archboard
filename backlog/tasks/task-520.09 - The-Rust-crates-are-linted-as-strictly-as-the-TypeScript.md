---
id: TASK-520.09
title: The Rust crates are linted as strictly as the TypeScript
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T04:29:00Z'
updated_date: '2026-10-25T06:02:00Z'
labels: []
dependencies: []
parent_task_id: TASK-520
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TypeScript source is held to a strict analysis policy (TASK-150, .oxlintrc.jsonc): every warning fails, cyclomatic complexity is capped at 6, files at 600 lines, and documentation, import boundaries and module layout are enforced. The Rust crates under crates/ get only clippy's default set with --deny warnings (lint:core). Choose a Rust lint set of the same strictness from current Rust practice (rustc lint groups, clippy groups and selected restriction lints), not a 1:1 port: reject TypeScript rules that do not make sense in Rust, and say why. Configure it once for the workspace, make every crate pass it, and keep every corpus picture byte-identical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One workspace lint table in Cargo.toml holds the policy, every crate inherits it, and lint:core denies every warning it raises
- [ ] #2 Each chosen lint, and each TypeScript rule rejected for Rust, is recorded with its reason in the repository's lint policy documentation
- [ ] #3 Every crate passes the policy without a crate-wide allow; each local allow names its reason
- [ ] #4 Every corpus picture is the same bytes as before the change, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Render the corpus baseline (/tmp/lints-before) before any crate edit.
2. Probe every candidate lint (rustc allow-by-default lints, clippy pedantic, nursery and restriction) natively and on wasm32, and count findings per lint to judge each one.
3. Write the policy once: [workspace.lints] in Cargo.toml (all at warn; lint:core denies warnings), thresholds in clippy.toml (cognitive complexity 6 as the TypeScript's complexity cap), [lints] workspace = true in every crate, clippy.toml in the Rust checks' cache inputs.
4. Fix the findings by kind: machine-applicable sweeps (unreachable_pub, elided lifetimes), public API docs (missing_docs), cast lints, complexity splits, the small pedantic findings; each exception a local #[expect(lint, reason)].
5. Record each chosen and rejected lint, and each TypeScript rule that does not carry over, in docs/agents/strict-analysis.md.
6. Render /tmp/lints-after and compare (must be 0 differ); run lint:core native and wasm32, test:core, then bun run check lane by lane.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (branch rust-lints, from 6bcf7ebbf, head aa45f17af):
- Policy: one [workspace.lints] table in Cargo.toml (rustc: unsafe_code forbid, missing_docs, unreachable_pub, four groups, eleven single lints; clippy: all + pedantic less cast_precision_loss/float_cmp/must_use_candidate/similar_names, 15 picked nursery lints, 30 picked restriction lints). Everything else at warn; lint:core denies warnings. clippy.toml: cognitive-complexity-threshold 6, avoid-breaking-exported-api false, allow-unwrap-in-tests, doc-valid-idents. Every crate has [lints] workspace = true. clippy.toml joined the core lanes' cache inputs.
- Docs: docs/agents/strict-analysis-rust.md records each chosen lint, each rejected lint with its finding count and reason, the thresholds, the 25 expects, and each TypeScript rule that does not carry over; strict-analysis.md links it.
- Fixes: unreachable_pub and elided lifetimes swept; small pedantic/nursery/restriction findings fixed in code; casts made integer where the value is a count or index, ten checked float-to-integer casts carry expects; every function over complexity 6 split (router, scene, layout, flows); every public item documented (8 vocabulary enums carry missing_docs expects), and every private function and type documented too.
- Decision: missing_docs_in_private_items stays off (it also asks for 816 private field/constant/variant docs); private functions are documented but not lint-enforced.
- Decision: no file-length lint exists in clippy; 13 crate files exceed 600 lines. Left for the parent to decide.
Evidence:
- nix develop -c bunx vp run lint:core (wasm32, --deny warnings): pass. Native cargo clippy --locked --workspace --all-targets -- --deny warnings: pass. cargo fmt --all --check: pass. cargo test --locked --workspace: 73 passed.
- Corpus: render-corpus compare /tmp/lints-before /tmp/lints-after: "0 of 2344 drawings differ".
- bun run check: exit 0, all 18 vp tasks successful, bun tests 4881 pass 1 skip 0 fail, system 257 pass, serial browser lane 19 files exit 0.
- No #[allow] anywhere in crates/ (allow_attributes refuses one); no crate-wide expect.

Follow-up (coordinator's three gaps), head eefb78d23 plus this note:
- File length: tests/system/repository-policy/rust-crates.test.ts (test:repository) refuses any .rs file under crates/ over 600 lines, counted as max-lines counts. The 13 long files were split into 23 new modules (commits f9e60e8be, a9069c6ec, a794e2c48, 6b70d47d4, c465bf5e8). A multiset diff of removed and added lines shows only use lists, impl headers, visibility and rustfmt reflow: the code moved and did not change. Largest crate file now 588 lines.
- Inheritance: the same test refuses a crate manifest under crates/ without [lints] workspace = true. A probe with workspace = false failed it, and a probe with a 601-line file failed the cap.
- Rustdoc: [workspace.lints.rustdoc] all = warn, and lint:core-docs in lint:all runs RUSTDOCFLAGS='-D warnings' cargo doc --locked --workspace --no-deps --document-private-items. It found 13 unresolved links, which were the router's paper citations [W09]/[W12]/[D05], now escaped. A probe with one unescaped citation failed the lane.
- Evidence: render-corpus compare /tmp/lints-before /tmp/lints-after2: "0 of 2344 drawings differ". bun run check: exit 0, 19/19 tasks, bun tests 4881 pass 1 skip 0 fail, system 257 pass, repository 144 pass, serial browser lane exit 0.
- Observed, not changed: the export-types binary prints its declarations in a different order after each rebuild (three rebuilds gave three md5 sums). The set of declarations is the same. Not checked at the base commit.
<!-- SECTION:NOTES:END -->
