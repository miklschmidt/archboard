---
id: TASK-143.06.08
title: Update current documentation after legacy injection removal
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-03 10:57'
labels: []
dependencies:
  - TASK-143.06.03
  - TASK-143.06.07
  - TASK-143.08.04
  - TASK-143.08.06.05
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
  - docs/design/codex-workbench-delivery-map.md
modified_files:
  - AGENTS.md
  - README.md
  - TESTING.md
  - DESIGN.md
  - docs/agents/test-suite.md
  - docs/design/stateless-server.md
  - tests/system/repository-policy/legacy-injection-retirement.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update current user, agent, test, and architecture documents only after the remaining legacy cleanup, recovered Codex lifecycle, and browser-independent board workflow are complete. Describe the final owned app-server semantic delivery and `archboard browser` boundary once, while preserving ADR 0005 and measured historical research as history. This is the sole final current-documentation owner before recovery reconciliation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Current setup, help, and testing docs remove ARCHBOARD_INJECT*, shared-daemon injection commands and routes, and claims that users can arm legacy injection.
- [ ] #2 Current architecture describes exact thread-link semantic delivery, one private stdio session, outcomes, controlled and real tests, and the executable browser-owner inventory reported by the repository at execution time; TESTING.md says Archboard owns dedicated CODEX_HOME, CODEX_SQLITE_HOME, config, and app-server state rather than user-global configuration, with coordinator voice separate from the linked workhorse.
- [ ] #3 DESIGN.md permits spoken approval only from one matching final user item after the effect prompt and never from an assistant transcript; ADR 0005 and historical research remain unchanged or explicitly superseded, links stay valid, and no current document advertises a control socket.
- [ ] #4 tests/system/repository-policy/legacy-injection-retirement.test.ts rejects retired user-global, shared-thread, assistant-transcript, control-socket, and stale current-doc claims; any browser-owner agreement is derived from the executable inventory rather than an unexplained historical count; CLI audit, README, TESTING, DESIGN, AGENTS, executable routes, commands, and tests agree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile AGENTS.md, README.md, TESTING.md, and DESIGN.md with the integrated owned-session contract: dedicated CODEX_HOME/CODEX_SQLITE_HOME/config/epoch state, explicit pane-to-workhorse links, distinct coordinator voice, one-shot thread/inject_items delivery, and delivered/not_delivered/outcome_unknown handling.
2. Replace literal browser-owner counts and duplicated owner lists in AGENTS.md and docs/agents/test-suite.md with BROWSER_TEST_PATHS-derived commands and language; keep browser-free board work separate from explicit archboard browser control.
3. Rename the existing legacy-removal repository policy owner to the task's retirement owner and extend it with cheap structured/static checks for retired setup/routes/imports, user-global configuration, assistant-transcript authority, private-session/current-doc markers, CLI audit agreement, and executable inventory derivation.
4. Preserve ADR 0005 and docs/design/stateless-server.md byte-for-byte, run only the renamed repository-policy owner plus scoped format/link/diff checks, record exact evidence, and commit the scoped implementation without finalizing the task.

5. Review remediation: remove the completed owned-workbench item from the DESIGN.md Later section, update the named-board authority pointer to ADR 0020, and strengthen the existing policy owner by extracting the Later and spoken-approval regions before asserting their stable semantic relationships.
6. Rerun only the exact policy owner, scoped Oxfmt and local-link/static checks, preserved-history comparison, and diff checks; record a new in-progress note and commit without amending or finalizing.

7. Standards remediation: make DESIGN.md's bound app-server section the sole full semantic contract; reduce AGENTS.md, README.md, and TESTING.md to audience-specific facts and direct pointers. Expand the existing policy owner across non-test src TS/TSX with concept-level retired route/module detection and replace prose snapshots with structural section/link/domain-identifier checks.

8. Final Standards remediation: add block-level negative guards inside the existing current-document policy for positive same/existing-workhorse voice guidance and actionable control-socket guidance, with explicit retirement/negative exemptions; run only the requested focused owner, file-scoped format/lint, and diff checks.

9. Accepted matcher correction: detect observed shared-thread voice guidance without requiring workhorse, classify control-socket guidance sentence by sentence, and add four boundary expectations inside the existing current-document test case; rerun only the focused owner and file-scoped checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the current-document reconciliation against fixed base ff889201a306f0b819c668ea350761c3d9b9885a. AGENTS.md, README.md, TESTING.md, and DESIGN.md now describe one private package-local stdio child with dedicated CODEX_HOME, CODEX_SQLITE_HOME, strict config, epoch/app-server state, explicit pane-to-workhorse links, separate coordinator voice, one thread/inject_items developer-message attempt, and delivered/not_delivered/outcome_unknown handling. TESTING.md no longer directs users to edit user-global Codex configuration. DESIGN.md now arms spoken approval only from the next matching final user item after the effect prompt and excludes assistant output, provisional/pre-prompt input, duplicates, and stale sessions. Browser-free board work remains the main path; explicit archboard browser commands alone inspect or control a live session.

Replaced literal browser-owner counts and the duplicated command list with BROWSER_TEST_PATHS-derived guidance. Renamed the existing removal policy owner to tests/system/repository-policy/legacy-injection-retirement.test.ts and extended the same cheap static owner; no new owner, subprocess test, browser test, timing test, or rule exception was added. The owner checks retired CLI/runtime files, production imports/routes, CLI audit absence, current docs, user-global setup, spoken authority, and count-free executable inventory.

Final capped evidence: the exact policy owner passed 4/4 tests and 59 expectations in 0.046s, reporting 18 owners from BROWSER_TEST_PATHS at execution. It used one Bun test process under one timeout supervisor and started zero product/server/app-server/browser processes. Pinned Oxfmt checked 6 scoped files in 0.268s using one formatter process under one timeout supervisor and 24 worker threads. A Bun static link check resolved local links in 5 current documents in 0.009s using one process under one timeout supervisor. git diff --check passed. ADR 0005 and docs/design/stateless-server.md remain byte-identical to the fixed base. Root typecheck, full repository/system/browser lanes, servers, and browsers were not run, as required. The requested writing-for-agents skill was unavailable in this checkout; repository agent-document rules and the mandatory unslop skill were applied directly.

Review and Standards remediation after 351bd794: removed the completed owned-workbench item from DESIGN.md's Later section and updated the named-board authority paragraph from superseded ADR 0009 language to persisted named-board refusal under ADR 0020. DESIGN.md's bound app-server section is now the sole full semantic delivery contract. AGENTS.md, README.md, and TESTING.md retain only audience-specific state, role, or verification facts and link directly to that section.

The existing retirement owner now scans every non-test TS/TSX file under src and reports concept-level matches for any /api/injection route or subpath, app-server-control token, and retired injection module path including extensionless relative imports. It retains absent-file and CLI-audit checks. Current-doc checks now use stable section extraction, identifiers, and authoritative link targets rather than replacement-prose snapshots. The Later region cannot list the owned workbench. The spoken-approval paragraph must contain the next matching final user item and must place Assistant output inside the explicit cannot-arm source set; a positive Assistant-output arm relationship is rejected. The authoritative voice paragraph must keep coordinator and workhorse distinct. No test file, test process, product process, or rule exception was added.

Final capped remediation evidence: the exact retirement owner passed 4/4 tests and 64 expectations in 0.112s, using one Bun process under one timeout supervisor and starting zero product/server/app-server/browser processes. Scoped Oxfmt checked 5 files in 0.274s using one formatter process under one timeout supervisor and 24 worker threads. The local-link check resolved all links in 4 affected docs in 0.008s using one Bun process under one timeout supervisor. Historical comparison, git diff --check, and scoped static searches passed; ADR 0005 and docs/design/stateless-server.md remain byte-identical to the fixed base. Root typecheck, full repository/system/browser lanes, servers, and browsers were not run.

Final Standards remediation at 77d0118e adds two negative, block-scoped structural guards to the existing legacy-injection retirement owner. Current documents now reject actionable guidance that attaches, connects, uses, or runs voice on the same/existing workhorse thread, while allowing explicitly negated guidance; they also reject actionable arm/connect/enable/open/run/start/use control-socket guidance, while allowing retirement, unavailability, supersession, removal, no-socket, and explicit non-use statements. Validation: focused owner 4 tests / 66 expectations in 0.063s (one Bun process); Oxfmt check 0.107s (one process); Oxlint 0.091s (one process); git diff --check passed. Added cost: zero new test cases, files, process owners, browser owners, or server/runtime lanes.

Accepted matcher correction at 906fe680: the shared-thread guard now evaluates sentences and rejects voice plus attach/connect/use/run plus same/existing plus thread without requiring workhorse; explicit cannot/do-not/does-not/never and direct target negations remain allowed. The control-socket guard now evaluates each sentence independently, so a retired historical sentence cannot mask a later positive action sentence. Four expectations inside the existing current-document test establish the observed former shared-thread sentence, a mixed retired-plus-use block, an allowed retired statement, and an allowed cannot-connect statement. Final focused evidence: 4 tests / 70 expectations in 0.067s using one Bun test process under one timeout supervisor; Oxfmt check 0.101s using one formatter process; Oxlint 0.124s using one lint process; git diff --check passed. Added cost remains zero new test cases, files, process owners, browser owners, server owners, or runtime lanes.

Final rerun after restoring the exact former TESTING wording in the boundary example supersedes the preceding timing: focused owner 4 tests / 70 expectations in 0.078s; Oxfmt check 0.112s; Oxlint 0.120s; git diff --check passed. Process and added-cost counts are unchanged.
<!-- SECTION:NOTES:END -->
