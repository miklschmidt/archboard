---
id: TASK-138
title: Restore GitHub Actions CI and keep main green
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-29 16:14'
updated_date: '2026-08-29 18:39'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/33100307429'
  - .github/workflows/ci.yml
  - docs/agents/test-suite.md
modified_files:
  - .github/workflows/ci.yml
  - src/runtime/engine/tests/board-version-note.test.ts
  - tests/system/boards/malformed-input.test.ts
  - tests/system/browser/run-browser-lane.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/code-targets/activation-contract.test.ts
  - tests/system/repository-policy/ci-browser-gate.test.ts
  - tests/system/repository-policy/support/test-inventory.ts
  - tests/system/repository-policy/test-inventory.test.ts
priority: high
type: bug
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions is failing on the current repository state and is expected to fail again when the completed local main branch is pushed. Maintainers need the public push gate to reflect the same verified behavior as the local repository, without weakening tests, lint, formatting, type rules, or browser coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The currently failing GitHub Actions run is diagnosed from its public workflow and job logs, with the actionable cause recorded.
- [ ] #2 The smallest repository or workflow correction passes the relevant focused checks and bun run check locally without weakening any existing gate.
- [ ] #3 The completed main branch is pushed to origin only after the local fix is verified.
- [ ] #4 Every required GitHub Actions check for the pushed main commit completes successfully.
- [ ] #5 Any subsequent CI-only failure is diagnosed and repaired in a monitored push-and-check loop until the pushed commit is green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update `.github/workflows/ci.yml` to keep one sequential Ubuntu job, replace stale `actions/checkout@v4` with `@v7`, retain package-pinned Bun through `oven-sh/setup-bun@v2`, frozen dependency installation, and pinned `agent-browser@0.34.0`, explicitly install `strace`, then install Chrome and Linux libraries with `agent-browser install --with-deps`. Remove the standalone frontend build and directory assertion because the canonical `test:serial-browser` lane inside `bun run check` owns frontend freshness and builds once when needed. Leave `bun run check` as the workflow's only package-script invocation.
2. Strengthen the existing CI repository policy in `tests/system/repository-policy/support/test-inventory.ts` and `test-inventory.test.ts`: require exactly one `bun run check` and reject any other direct package-script invocation, with mutation diagnostics for missing, duplicate, direct-build, and direct-test drift. The browser adapter and inventory remain the fail-closed enforcement for the 15 literal owners and their prerequisites.
3. Run the focused fixed-base CLI case and repository-policy owner, then one sequential `bun run check`, keeping logs under `/tmp` and auditing cleanup. This exercises lint, formatting, both TypeScript projects, modules, serial system owners, repository inventory/policy, and all 15 serial headless browser owners.
4. Commit the repair and TASK-138 plan/evidence conventionally. Fetch `origin/main`, prove it remains an ancestor of local `main`, and push without force.
5. Monitor GitHub Actions for the exact pushed SHA until terminal. For a failure, inspect the workflow and job logs, apply the smallest repair, rerun proportionate local gates, commit, push, and repeat on the new SHA. Do not omit or soften a lane.
6. After a green pushed repair, read the finalization guide, verify each acceptance criterion from objective evidence, finalize TASK-138, commit and push that metadata, and monitor the final pushed SHA to green.

7. Browser executable isolation amendment. After agent-browser install --with-deps, CI resolves the exact downloaded Chrome executable and exports it as AGENT_BROWSER_EXECUTABLE_PATH for the one bun run check process. tests/system/browser/run-browser-lane.ts validates that configured path before any frontend build or owner acquisition and returns could-not-run exit 2 with an actionable diagnostic when it is missing, not a file, or not executable. The adapter passes that exact path through browserTestEnvironment into each isolated owner while retaining the per-owner HOME/XDG/socket/session/namespace contract; canvas and other child environments continue to strip browser configuration. A focused fake/preflight regression proves the executable reaches an isolated owner and that missing/non-executable configured paths stop before build/owner acquisition. The workflow also declares top-level permissions: contents: read and retains the 30-minute timeout.

8. Review remediation. Keep AGENT_BROWSER_EXECUTABLE_PATH optional for documented local PATH-based use, but validate and normalize it strictly before build when configured. Delete every owner argv substitution hook; test the exported environment seam and canonical adapter behavior without changing owner selection. Parse workflow run steps so only one executable step equal to bun run check is accepted, while comments and quoted output cannot satisfy policy. Preserve independent mutation cases under the 500-line owner cap. Re-run focused policy/browser coverage and one clean complete check, then commit for rereview without pushing or finalizing.

9. Second review remediation. Replace the partial command-start scanner with fail-closed detection over YAML run scalars after quoted text and shell comments are removed. Reject unquoted bun run tokens behind env/command wrappers, grouping, conditionals, and pipelines while ignoring echo-only text. Split each predecessor inventory mutation family into its own Bun test, keep every owner below 500 lines, and run repository-policy plus type, lint, format, and diff checks. Do not rerun browser or the full gate unless these focused checks expose wider impact.

10. Quoted command-substitution amendment. Keep single-quoted shell text inert, but retain the bodies of dollar-parenthesis and backtick command substitutions inside double quotes so executable bun run tokens cannot hide there. Add separate negatives for echo with dollar-parenthesis, assignment with dollar-parenthesis, and double-quoted backticks while retaining the inert quoted and echo controls. Run the two focused policy owners and static checks only, then commit for rereview without pushing or finalizing.

11. Dollar-substitution comment amendment. Add shell-comment state to dollarSubstitutionAt using the scanner boundary rule so quotes and parentheses inside a comment cannot close the substitution before newline. Keep the unterminated-body fail-closed fallback. Add the valid multiline Bash form with a commented closing parenthesis as its own negative, run both focused policy owners and static checks, then commit without browser/full validation, push, or finalization.

12. Clean-runner module-owner remediation. Reproduce the exact pushed CI failure with ARCHBOARD_VAULT absent, then make board-version-note.test.ts own a temporary vault before the first config-sensitive dynamic import. Preserve and restore a caller-provided sentinel exactly, delete an originally absent variable, remove the owned root, and retain Bun module isolation. Verify unset and sentinel-focused runs, the module lane and proportional static gates, then run one clean bun run check with ARCHBOARD_VAULT explicitly unset. Commit for integration review without pushing or finalizing.

13. Unset-vault system-owner amendment. The complete unset full gate exposed three additional same-process test-owner failures after the module repair: one boards case and two code-target default-dependency cases. Give each owner a temporary vault before its first config-sensitive import, assert the imported config uses that owned root, dispose its canvas/server/fixture resources before removing the root, and restore or delete the caller environment exactly. Verify the two owners with both absent and caller-sentinel environments, then run the full unset system lane, static gates, and the clean complete gate; do not change production, default missing-vault behavior, or workflow environment.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis and complete-workflow audit, 2026-08-29:

- Failing run: https://github.com/miklschmidt/archboard/actions/runs/33100307429 at origin/main `06764ab762b1951379c0ed5e89a6d66edc41da8e`. Job `98615922915`, step `Run all checks`, failed in the legacy `test:contracts` compatibility runner. The golden expected `open /proc/AGENTS.md`; GitHub produced `mkdir /proc/.archboard/vault`. The legacy runner inherited caller `ARCHBOARD_VAULT`, so the local environment and clean Actions environment reached different late-failure operations. Current HEAD replaced that runner with `createPackageCliOwner`, which always supplies an owned vault; the 11-case focused owner passes locally.
- Trigger and concurrency: push and pull_request on main, one job, cancel prior same-ref run. This preserves required serialization.
- Checkout: `actions/checkout@v4` is stale. The failed log warns that its Node 20 runtime is deprecated and Actions is forcing Node 24. Final uses the current v7 major.
- Bun: `oven-sh/setup-bun@v2` already reads `packageManager: bun@1.4.0`; `bun install --frozen-lockfile` matches the lockfile contract. No dependency cache exists, and install took about two seconds in the failed run, so adding cache state has no evidence-backed value.
- Browser CLI: `bun add --global agent-browser@0.34.0` and `$HOME/.bun/bin` are correct and intentionally pinned to the adapter contract. The failed run proves installation succeeds on ubuntu-latest.
- Chromium/runtime: `agent-browser install --with-deps` successfully downloaded Chrome for Testing and apt-installed browser libraries in the failed run. It does not install the human-performance owner's `strace` prerequisite, so final setup installs `strace` explicitly.
- Frontend build: separate `bun run build` and `test -d dist/frontend` are stale duplicate ownership. The serial browser adapter checks freshness and builds at most once; removing these steps makes CI exercise the same clean-checkout path as `bun run check`.
- Public gate: `bun run check` is correct and expands to lint, formatting, both TypeScript checks, modules, the eight serial system directories, repository policy/inventory, and the 15 literal serial headless browser owners. No lane is split, sharded, skipped, allowed to fail, or invoked separately.
- Timeout/resource risk: keep the 30-minute job limit. The browser lane is serial by contract and may dominate runtime; Chrome download and apt/network setup are the main CI-only risks. All prerequisites fail closed, and the push monitor loop owns remediation. No impractical lane has been found, so no follow-up omission task is justified.

Implementation evidence, fixed base ee31c07, 2026-08-29:

- TDD red: workflow mutation tests failed against the predecessor diagnostics; browser forwarding fake failed because the isolated owner did not receive AGENT_BROWSER_EXECUTABLE_PATH. Green focused repository-policy owner: 17 tests, 103 assertions.
- Focused fixed-base package compatibility: 11 tests, 165 assertions. Focused real browser recovery after an intentionally removed derived bundle: fixed-point 1/1 and human-performance 1/1, with the latter measuring 10,000 elements headlessly.
- Preflight residue proof: missing, relative, absent, directory, and non-executable configured paths exit 2 before agent-browser probing, frontend build, or owner acquisition. The focused refusal test left the full dist/frontend hash unchanged at ddf89d3782ba25e3e6b106c655514be0f55325eab9a9a1d6acd3f9a9b8d9f8f7.
- Honest failed full-check evidence is retained in /tmp/task138-full-check.log and /tmp/task138-final-full-check.log. The first used a malformed ignored bundle produced before the frozen install; the second caught a stray test assertion that rejected legitimate Vite stderr during a clean build. Neither was a product gate weakening, and both causes were removed before acceptance.
- Clean acceptance from absent dist/frontend: AGENT_BROWSER_EXECUTABLE_PATH=$(realpath ~/.agent-browser/browsers/chrome-150.0.7871.46/chrome) bun run check, exit 0. It passed lint, formatting, both TypeScript projects, 400 module tests, 250 serial system tests, 50 repository tests, and all 15 serial headless browser owners. Log: /tmp/task138-acceptance-full-check.log.
- Modified TypeScript physical lines: run-browser-lane.ts 498; browser support 385; inventory support 261; inventory owner 498. All remain below the enforced 500-line cap.
- Workflow contract: top-level contents:read; checkout@v7; setup-bun@v2; frozen install; explicit strace; pinned agent-browser@0.34.0; install --with-deps; exactly one downloaded executable named chrome resolved with realpath and exported through GITHUB_ENV; one bun run check; 30-minute timeout. No skip, shard, allow-failure, or continue-on-error path was added.

Review remediation evidence, 2026-08-29:

- Independent review RED: tests/system/repository-policy/ci-browser-gate.test.ts produced 6 expected failures against a680db7. Raw workflow text let comments and quoted echo text count, local execution rejected an unset AGENT_BROWSER_EXECUTABLE_PATH, and ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE replaced the canonical owner argv. Log: /tmp/task138-review-red.log.
- The adapter now treats AGENT_BROWSER_EXECUTABLE_PATH as an optional local override. When set, it normalizes and validates the absolute file and execute bit before agent-browser probing, frontend build, or owner acquisition. When unset, agent-browser keeps its documented PATH and Nix/system browser discovery. The canonical Bun owner argv is literal and immutable. A real adapter boundary with a fake agent-browser proves that a normalized path reaches the canonical isolated owner and that the former substitution input is ignored. Canvas subprocesses retain the existing AGENT_BROWSER_* stripping.
- CI policy now parses YAML jobs and run steps. It requires one executable step exactly equal to bun run check, ignores comments and quoted echo output, and rejects missing, duplicate, direct build/test, whitespace, and multiline drift as separate Bun tests in ci-browser-gate.test.ts. The original inventory/cleanup owner remains independent.
- Focused green: ci-browser-gate.test.ts 15 tests and 46 assertions; combined inventory and CI/browser owners passed before the final run. Type-check, Oxlint, formatting, and diff checks passed.
- First clean post-review full-check attempt is retained honestly in /tmp/task138-review-full-check.log. Lint, formatting, TypeScript, and 400 module tests passed, then unrelated board-inspection subprocess owners repeatedly exceeded existing 5-second and 40-second limits. Bun later hung at one core after the 30-second source-staleness timeout; only the owned check process group was stopped, for exit 143. No TASK-138 owner failed and no gate was changed. Its one source-staleness temp directory and derived bundle were removed before retry.
- Clean retry with AGENT_BROWSER_EXECUTABLE_PATH explicitly unset passed bun run check: 400 module tests, 250 serial system tests, 60 repository-policy tests, and all 15 serial headless browser owners. Log: /tmp/task138-review-full-check-retry.log. This directly verifies the reviewed local PATH interface.
- Final physical lines: run-browser-lane.ts 486; agent-browser.ts 387; inventory support 353; inventory owner 370; CI/browser policy owner 227. Final cleanup removed dist, found no browser lane or preflight roots, and found no surviving check, browser, or owner process.

Second review remediation evidence, 2026-08-29:

- Workflow RED: the five requested executable mutations all passed through the reviewed scanner: env FOO=1 bun run test, command bun run build, a grouped bun run test, a conditional bun run test, and a pipeline into bun run build. Log: /tmp/task138-rereview2-workflow-red.log. Two self-review slices also went red before their fixes: executable backtick substitution in /tmp/task138-rereview2-backtick-red.log and a shell comment following a command separator in /tmp/task138-rereview2-comment-red.log.
- inspectWorkflow still gets run scalars from Bun.YAML. It now blanks quoted content and shell comments, finds every remaining bun run token sequence regardless of wrapper, grouping, control prefix, command substitution, or pipeline position, and exempts only an echo/printf simple command. The one accepted gate remains a scalar exactly equal to bun run check. Fifteen independent workflow-policy tests cover acceptance, comments/echo text, canonical count, direct scripts, every reviewed wrapper/control form, command substitution, whitespace, and multiline drift.
- The predecessor inventory diagnostics no longer share grouped test bodies. test-inventory.test.ts now reports 38 independent tests. Missing lane, orphan, cross-lane ownership, unreachable lane, duplicate reachability, transitional lane, system/browser drift, and each adapter mutation have separate Bun tests or test.each cases. No expectation was removed or folded into one aggregate assertion.
- Complete repository policy: 94 tests, 268 assertions, exit 0. Log: /tmp/task138-rereview2-repository-green.log. TypeScript, Oxlint, formatting, and git diff checks also pass; logs use the /tmp/task138-rereview2-* prefix. Physical lines: inventory support 360, inventory owner 408, CI/browser owner 273.
- Per second review direction, no browser or complete gate rerun was performed. This follow-up changes only the repository-policy scanner, its focused tests, and TASK evidence; the prior clean full acceptance remains /tmp/task138-review-full-check-retry.log.

Quoted command-substitution remediation evidence, 2026-08-29:

- TDD RED: echo with double-quoted dollar-parenthesis, a double-quoted assignment using dollar-parenthesis, and double-quoted backticks all hid executable bun run tokens from the scanner. All three independent negatives failed in /tmp/task138-rereview3-red.log.
- The scanner still blanks ordinary double-quoted text and every single-quoted span. It now extracts balanced dollar-parenthesis and backtick bodies only when they occur inside double quotes, sanitizes each body with the same quote/comment rules, and scans nested quoted substitutions recursively. Unquoted backticks remain covered. Separate controls retain inert plain double-quoted text, single-quoted substitution text, comments, and echo-only text.
- Focused policy owners passed 65 tests and 118 assertions: test-inventory.test.ts 38 tests; ci-browser-gate.test.ts 27 tests, comprising 19 workflow-policy cases and 8 browser-boundary cases. Log: /tmp/task138-rereview3-focused-green.log. TypeScript, Oxlint, formatting, and git diff checks pass; logs use the /tmp/task138-rereview3-* prefix.
- Physical lines: inventory support 471, inventory owner 408, CI/browser policy owner 295. Per review direction, no browser or complete gate rerun was performed because only repository-policy scanner/tests and TASK evidence changed.

Dollar-substitution comment-state remediation evidence, 2026-08-29:

- TDD RED: valid Bash echo with a double-quoted substitution, a commented closing parenthesis, then bun run test on the next line returned no policy error. The independent negative failed in /tmp/task138-rereview4-red.log.
- dollarSubstitutionAt now uses the shared shell-comment boundary check. Once a comment starts, quotes and parentheses are ignored until newline; scanning then resumes at the existing substitution depth. If no real closing parenthesis follows, the existing fail-closed fallback still returns the remaining body for executable-token inspection.
- Focused policy owners passed 66 tests and 119 assertions: inventory owner 38; CI/browser owner 28, comprising 20 workflow-policy and 8 browser-boundary cases. Log: /tmp/task138-rereview4-focused-green.log. TypeScript, Oxlint, formatting, and git diff checks pass; logs use the /tmp/task138-rereview4-* prefix.
- Physical lines: inventory support 484, inventory owner 408, CI/browser policy owner 302. Per direction, no browser or complete gate rerun was performed because only the repository-policy scanner, its focused test, and TASK evidence changed.

Clean-runner CI remediation evidence, pushed SHA c98a229, 2026-08-29:

- GitHub Actions run 33267557636, job 99140225454 failed in src/runtime/engine/tests/board-version-note.test.ts because the clean runner had no ARCHBOARD_VAULT. config.ts snapshots the environment at module import; the test created a temporary directory but never made it the process vault, while the prior local shell inherited a vault and masked the isolation defect. Full job log: /tmp/task138-ci2-job.log.
- Focused TDD RED with ARCHBOARD_VAULT removed: board-version-note 3 passed / 5 failed, all through requireVaultRoot before their intended note assertions. Log: /tmp/task138-ci2-focused-unset-red.log. The owner now exports its temporary root before any config-sensitive import and, after module cleanup, removes that exact root and restores the caller value or deletes an originally absent variable. Unset and caller-sentinel focused runs each pass 8 tests / 47 assertions; the sentinel remains empty and no owner root remains. Logs: /tmp/task138-ci2-focused-unset-green.log and /tmp/task138-ci2-focused-sentinel-green.log. The complete unset module lane passes 400 tests / 3,144 assertions: /tmp/task138-ci2-modules-green.log.
- The first complete unset check passed static gates and 400 modules, then unrelated board-inspection subprocesses exceeded existing 5-second and 40-second limits and Bun hung after the source-staleness timeout. The owned process group alone was killed after TERM was ignored, and its one staleness root was removed. Honest log: /tmp/task138-ci2-full-check.log. A clean retry cleared every timeout and enumerated exactly three further inherited-vault defects: one direct boards engine call and two code-target default-dependency reads; 247 of 250 system tests passed. Honest log: /tmp/task138-ci2-full-check-retry.log.
- Focused system-owner TDD RED reproduced those exact three failures: 21 passed / 3 failed. The boards and code-target owners now each establish an owned vault before the first config-sensitive import, assert the imported config sees it, dispose canvases/servers/fixtures first, remove the exact root, and restore or delete caller state. No production route, resolver, config, or workflow-wide environment changed. Unset and caller-sentinel focused runs each pass 26 tests / 96 assertions, retain the existing note/config byte and mtime checks, leave the sentinel empty, and leave no owner or fixture root. Logs: /tmp/task138-ci2-system-owners-red.log, /tmp/task138-ci2-system-owners-unset-green.log, and /tmp/task138-ci2-system-owners-sentinel-green.log.
- Complete unset system lane passes 252 tests / 4,130 assertions: /tmp/task138-ci2-system-lane-green.log. TypeScript, Oxlint, formatting, and diff checks pass. Physical lines remain below 500: board-version-note 345; malformed-input 225; activation-contract 446; run-browser-lane 486; agent-browser support 387; CI/browser policy 302; inventory support 484; inventory owner 408.
- Final clean acceptance from absent dist/frontend and with ARCHBOARD_VAULT explicitly removed passes bun run check: lint, formatting, both TypeScript projects, 400 module tests, 252 system tests, 99 repository-policy tests, and all 15 sequential headless browser owners. Log: /tmp/task138-ci2-final-full-check.log. Final cleanup removed the generated dist, found no new vault/browser fixture roots, and found no surviving TASK-138 check, canvas, browser, or owner process.

Evidence correction after final formatting: tests/system/boards/malformed-input.test.ts is 223 physical lines (not the pre-format 225); every stated line cap remains satisfied.
<!-- SECTION:NOTES:END -->
