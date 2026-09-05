---
id: TASK-150.01.01
title: Quarantine the old UI and restore strict enforcement
status: In Progress
assignee: []
created_date: '2026-09-05 01:10'
updated_date: '2026-09-05 13:58'
labels: []
dependencies: []
parent_task_id: TASK-150.01
priority: high
type: task
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Preserve the established ignored UI reference archive and the already-written approved lint configuration. Do not replay the former full-catalogue rollout. This historical enforcement leaf is retained for traceability; remaining UI repairs belong to TASK-150.01.02.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The retired UI reference remains ignored and absent from active imports, builds and commits.
- [ ] #2 The approved UI lint configuration is in place, with the pre-task non-UI policy retained.
- [ ] #3 Strict compiler safety and current corrections are preserved without a separate UI TypeScript project.
- [ ] #4 User test deletions remain deleted; no synthetic toolchain or configuration-test work is required.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Approved lint policy (already written)
Canonical configuration: src/ui/.oxlintrc.jsonc; repository baseline: .oxlintrc.jsonc; all lint/fix entrypoints use scripts/lint.ts.
- Keep Archboard rules. Enable correctness, suspicious and perf at error. Leave style, pedantic, restriction and the overall nursery category off.
- Enable these nursery rules at error: import/named; import/export; eslint/no-restricted-exports with defaultFrom, direct, named, namedFrom and namespaceFrom all true; promise/no-return-in-finally; typescript/no-unnecessary-condition; eslint/no-unreachable-loop; unicorn/no-useless-iterator-to-array; typescript/prefer-optional-chain.
- Classic cyclomatic complexity is 6; max-lines is 600 physical lines including comments and blanks. Local UI imports use @/ aliases and retain module boundaries. UI source is TypeScript only.
- Plugins: eslint, typescript, unicorn, react, react-perf, import, jsdoc, jsx-a11y and promise.
- JSDoc uses flat/recommended-typescript plus require-description at error: concise function-purpose, parameter and return descriptions, without duplicate TypeScript types. Keep native jsdoc names where supported; jsdoc-extra supplies missing upstream rules. Require documentation on named functions, arrows, function expressions and methods.
- Keep noPropertyAccessFromIndexSignature. There is no separate UI TypeScript project. Keep the existing frontend compiler configuration for its browser entrypoints.
- New strict adoption outside src/ui is deferred to TASK-151; preserve previous corrections and the pre-task non-UI lint policy. Existing non-UI JavaScript tooling and generated declarations remain in that deferred adoption scope.

Current execution constraints: preserve all completed corrections and the user's test deletions. Do not restore deleted tests or add repository-policy suites, configuration snapshots, dependency/version mirrors, tests of upstream tooling, or tests of test helpers. Use the existing lint/compiler commands and meaningful existing product checks. New strict lint adoption is limited to src/ui; remaining non-UI adoption is TASK-151. UI uses the existing root TypeScript project; do not create src/ui/tsconfig.json. Run analysis sequentially and keep the repository project guard on all lint/fix paths. No callbacks to previous tasks, fixed agent assignments, or extra interim review loops.
Quarantine and configuration are implemented. Preserve archive isolation and current changes; do not rebuild deleted repository-policy tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Orchestrator decision 2026-09-05: retain the existing pure src/ui/board-preview/index.ts projection module, src/ui/canvas/elements.ts and src/ui/canvas/changes.ts, their minimum type-only dependency closure (currently src/ui/types/index.ts), and focused independently useful owners. The real renderer probes use projectPreviewSnapshot; server label-round-trip owners use diffAgainstBaseline/fingerprint. Retaining these active contracts avoids disabling mixed-use verification and is not early copying/porting from legacy/. Keep full strict analysis and do not retain rendered controls, hooks or session mounting merely because they share a directory. TASK-150.01.02 repairs these retained seams along with other active source.

Browser decision 1, tests/system/browser/fixed-point-document.test.ts: retain the owner and all existing behavioral assertions during quarantine, including its currently reachable elements.ts source-text assertion. Required regression is canonical document fidelity with no extra semantic fields hidden from comparison. The regex assumption about destructuring syntax is implementation-specific and must not dictate strict repairs or rebuilt UI; reassess that assertion in TASK-150.06 before execution if the implementation changes. No deletion or replacement of that assertion is authorized now. Retention of elements.ts is independently justified by renderer probes, not by this source-text assertion.

Browser decision 2, tests/system/browser/codex-live-voice.test.ts: approve removal of Samsung/Flip wording and mechanical flipDock-to-scaledDock identifier renaming only. Preserve viewport 1920x1080 at devicePixelRatio 2, active-session identity, Stop operability, inside-viewport/workbench-avoidance/source-fit and all focus, targets, live regions, reduced-motion and forced-colors assertions. These exercise generic desktop scaling rather than a dedicated device. TASK-150.06 owns actual execution and any later individual behavioral/selector replacement decision. No browser tests run now.

Orchestrator decision 2026-09-05: approve byte-preserving.ts.txt/.tsx.txt names for the three docs/design/vendor reading copies (ExcalidrawData and shadcn-base button/dialog), updating local references and preserving provenance. Their README already forbids compilation/import/shipping; they are research evidence with incomplete external context, not active TS program source. Remove the blanket vendor lint ignore. This does not authorize renaming active executable code or importing these texts into application code.

Orchestrator decision 2026-09-05: for codex-workbench-application-sockets, spoken-approval-terminal-projection and voice-context-producer-contract system owners, preserve independently useful backend assertions and archive only UI-dependent cases with exact recorded dispositions/restoration under TASK-150.07. The production socket ownership/replacement cases remain active; the UI media registration case may be deferred. Unknown-outcome propagation through spoken/visual cards and exact canonical-brief display/copy remain mandatory integration contracts. Avoid adding duplicate backend tests solely to retain a fragment.

Catalogue decision: all applicable categories may be enabled with explicit versioned audit entries for incompatible or genuinely inapplicable rules. Current usage alone does not prove inapplicability; diagnostic volume never justifies opt-out. The proposed no-inline-comments exclusion is not justified by adjacent suppression rationale because preceding comment lines can supply it; keep enabled unless a concrete incompatibility is demonstrated. Generated/shadcn exemption lists must classify individual authored style/structural rules and retain all required safety, type-aware, React correctness and accessibility checks.

Orchestrator decision 2026-09-05: approved explicit shell-expanded physical generated declaration arguments in the single normal Oxlint invocation after pinned-version evidence showed ignored-directory traversal omitted them. Current versions/* globs avoid current-symlink duplication. Coverage must independently compare physical retained TS-family source against selected lint files and name missing files; checking a glob string or count alone is insufficient. Do not include vendor-generated declarations in --fix input: verified untouched output must remain canonical, and generated diagnostics are fixed at the generator or owning contract. Normal lint still analyzes those files. Third-party declaration errors from strict compiler options require concrete diagnosis; no ad hoc node_modules edits or silent broad option relaxation.

Orchestrator decision 2026-09-05: do not introduce a dormant src/ui/components wildcard exemption before official files exist. Document the approved shadcn policy in this milestone; TASK-150.02 adds exact pinned official component paths and provenance verification with individually classified authored-style/structure exceptions. Generated diagnostics in ThreadRealtimeStartParams.prompt and ThreadForkParams.serviceTier are literal duplicated null union constituents. Keep their correctness rule enabled and upstream bytes untouched in enforcement; TASK-150.01.02 must resolve the canonical generator/policy boundary explicitly before passing the baseline. Capture grouped third-party strict-compiler errors for package-contract repair; no unreviewed dependency edits or blanket compiler relaxation.

IMPLEMENTED — TASK-150.01.01 quarantine/enforcement only; formal acceptance/status reconciliation remains with the coordinator after final review. BASE 0d1706d06b21df1c72910a640dadad35cd37234a. Canonical dispositions: docs/design/task-150-quarantine.md. Canonical full 870-rule catalogue audit and exact exclusions: docs/agents/strict-analysis.md and strict-analysis-policy.json.

Retired frontend entry and old UI into ignored local legacy/. All 281 snapshot files match BASE bytes; zero legacy tracked/staged entries. Retained approved pure preview/elements/changes/types closure, focused preview owner and all official fonts/licenses/provenance/wordmark. Kept independent renderer probes and label-round-trip coverage. Mixed system owners split per coordinator decisions; required deferred cases have restoration owners. Browser inventory remains unchanged; only approved hardware wording/identifier cleanup and three runSelection no-await-in-loop comments changed. Dedicated-display guidance/install listing removed. Reading-only vendor files renamed to.txt without byte changes.

Pinned oxlint 1.80.0 + oxlint-tsgolint 7.0.2001, one ordinary type-aware command, every applicable category, seven named rules, 500 physical authored lines and strict sequential compiler programs are enforced. Actual lint inputs: 1710 = 890 authored + 820 generated; zero archive. Independent physical-source coverage check passes. Explicit generated file arguments are required because directory traversal still honors Git ignores. Auto-fix remains authored-only and then runs complete lint. No dormant shadcn wildcard; actual official files/provenance and approved narrow exemptions are owned by TASK-150.02. Generated byte comparison against fresh pinned upstream output passes.

Validation: bun install and pinned dependency install pass; bun run fmt:check passes (974 files); bun run test:repository passes (130 cases); four focused retained owners pass (9 cases). Latest focused archive check passes (4 cases), including an isolated Vite port-0 HTTP 403/no-byte-leak proof with no browser. Actual lint exits 1 with 35539 errors and zero warnings; named typed diagnostics and generated no-duplicate-type-constituents are proven. bun run type-check exits 1: 2368 retained-source and 82 dependency diagnostic occurrences across both programs (overlap counted). These diagnostics are the intentional TASK-150.01.02 handoff, not a green strict baseline. No browser tests, smoke tests, build/product gate or aggregate browser command ran.

Dependency compiler inventory: @excalidraw/excalidraw 0.18.1 TS7016=30, TS2882=13, TS2724=6, TS2305=4, TS2307=19 (browser-fs-access package export/type resolution, internal alias/CSS declarations); @excalidraw/mermaid-to-excalidraw 2.2.2 TS2307=2 (element/transform export); bun-types 1.4.0 TS2687=1, TS2309=1 (ImportMeta.hot/export assignment); vite 8.2.2 TS2411=3, TS2687=1, TS2717=2 (ImportMetaEnv booleans versus Bun string index and hot augmentation). No node_modules edits or compiler relaxation. Generated duplicate-null sites remain untouched and require coordinator-directed canonical resolution.

Preserved work: original coordinator notes retained and authorized for commit; source checkout, src-DlBR1tzg.js and live port-3000/vault server untouched. No independent reviewer, worker, merge, push or publication. All repository operations targeted /home/msc/.codex/worktrees/2709/archboard. Full product verification remains TASK-150.06 after integration. Ephemeral detailed command evidence is under /tmp/task-150-*.log and /tmp/task-150-evidence.txt; regenerate it through the ordinary commands rather than committing derived logs.

Coordinator-requested evidence refinements: tracked quarantine record now keeps compact per-owner required/obsolete dispositions and restoration owners; raw reproducible import/case extraction is only /tmp/task-150-work/retired.json and /tmp/task-150-work/raw-import-case-inventory.md. Pinned Jest/Vitest exclusion now cites the exact upstream 1.80.0 binding collector limitation for imported bun:test (Bun is Jest-compatible). Machine-readable ordinary lint result: /tmp/task-150-lint.json, 35539 diagnostics; command/exit stderr /tmp/task-150-lint-json-command.log. Final text diagnostics /tmp/task-150-lint-complete.log; final compiler diagnostics /tmp/task-150-types-complete.log; grouped dependency inventory /tmp/task-150-evidence.txt. Coverage inputs /tmp/task-150-coverage.txt; repository /tmp/task-150-final-repository.log; retained owners /tmp/task-150-retained.log; archive direct proof /tmp/task-150-archive-complete.log; formatting /tmp/task-150-fmt-complete.log.
<!-- SECTION:NOTES:END -->
