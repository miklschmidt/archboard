---
id: TASK-138
title: Restore GitHub Actions CI and keep main green
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-29 16:14'
updated_date: '2026-08-29 16:48'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/33100307429'
  - .github/workflows/ci.yml
  - docs/agents/test-suite.md
modified_files:
  - .github/workflows/ci.yml
  - tests/system/browser/run-browser-lane.ts
  - tests/system/browser/support/agent-browser.ts
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
<!-- SECTION:NOTES:END -->
