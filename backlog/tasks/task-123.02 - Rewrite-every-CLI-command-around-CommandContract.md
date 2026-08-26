---
id: TASK-123.02
title: Rewrite every CLI command around CommandContract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 23:58'
updated_date: '2026-08-26 08:49'
labels: []
dependencies:
  - TASK-123.01
references:
  - src/cli/run.ts
  - src/cli/args.ts
  - src/cli/util.ts
  - src/cli/commands
  - src/core/canvas-client.ts
  - tasks/task-123.01
parent_task_id: TASK-123
priority: high
type: task
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate the full public Archboard CLI from the hand-written registry, raw argv handlers, scattered flag parsing, and anonymous printJson calls to the approved CommandContract and local Zod-to-Commander adapter from TASK-123.01. Preserve public command names, options, defaults, output meanings, refusal behavior, and established exit codes unless an explicitly linked task approves a compatibility change.

Each command handler accepts inferred validated input and returns an inferred domain result. The command boundary validates that result against its declared Zod schema and owns serialization. Command modules do not print, set process exits ad hoc, parse argv, or import Commander. Shared result concepts such as board identity, fingerprint, affected elements, generated handles, and refusal details use reusable schemas rather than structurally similar anonymous objects.

Migrate in vertical slices while keeping the complete CLI usable and tests green. Remove the legacy dispatcher and parsing helpers when the last command moves; do not leave two permanent command-definition systems.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every existing public command and subcommand is registered through CommandContract and handled through the local adapter, with no command handler receiving raw argv or importing Commander.
- [ ] #2 Every structured-success path returns a named, exported Zod result schema and inferred TypeScript type; the command boundary performs validation and serialization, and handlers contain no printJson calls.
- [ ] #3 Reusable schemas define shared board addresses, versions and fingerprints, affected and generated elements, stable handles, file artifacts, browser and server state, and refusal details without forcing unrelated commands into one oversized envelope.
- [ ] #4 JSON stdout remains valid and free of diagnostics; text, raw-content, and file-output commands use explicit contract modes; declared errors and refusals map consistently to stderr and established process exits.
- [ ] #5 Public command names, aliases, flags, defaults, stdin and file behavior, output meanings, ordering guarantees, browser and server prerequisites, and write semantics remain compatible except where a linked approved task specifies a change.
- [ ] #6 Legacy command registry, duplicated argument parsers, handler-side printing, and obsolete usage strings are deleted after migration, leaving one command-definition path.
- [ ] #7 Tests exercise every command contract plus representative end-to-end invocations, including invalid and cross-field input, invalid handler output, one-write enforcement, optimistic concurrency, absent browser or server, stdin, files, text mode, and jq consumption.
- [ ] #8 The CLI continues to run from source under the repository Bun version requirements, and Commander remains confined to the adapter boundary.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze a byte- and event-accurate fixed-base compatibility baseline for all 57 public paths before changing the contract API. Extend package-binary goldens to record argv, stdout and stderr bytes, merged event order, exit, held state, prerequisite contacts, REST/local effect order, and artifact commits. Pin status unavailable/foreign-service, held board-save conflict, diagnostic-before-failure cases for board list --here and install-skill, promote binding resolution after server/board-or-selection reads, and snapshot save/restore missing names after server contact.

2. Add public CommandOutcomeDeclaration data to CommandContract: a named id, declared nonzero exit, description, stream policy including stdout-only/stderr-only/stdout-and-stderr, and explicit ordered presentation. CommandExecution may select only a declared id and cannot carry exit, stream, order, description, or held policy. Ordinary success remains exit 0.

3. Centralize structured outcomes in runCommand/runCli with this exact order: select the declared outcome and output case; reject an undeclared outcome id; obtain held state and apply the selected held policy to form the complete public result; validate that held-adjusted public result; validate any pending artifact independently; only then commit the artifact and perform the declaration ordered presentation; set the declared exit last. Immediate boundary-owned diagnostics are the sole prevalidation stream lane. Handlers do not write process streams or set process.exitCode. Introspection exposes public declarations and never private execution, held state, diagnostics, or artifacts. Negative tests prove malformed held data, results, or artifacts reach neither structured output nor artifact writes.

4. Prove the outcome model before broader migration. Status declares unavailable and foreign-service as stdout-only exit 3 outcomes. Board save declares its structured conflict as exit 5 with exact conflict/result/held/continuation event order. Assert exact bytes, final newlines, empty or ordered stderr, held insertion before validation, validation-before-output, no unintended artifact, and exit-after-output.

5. Add src/cli/command-contract/schemas.ts for small reusable named Zod schemas and inferred types covering shared element ids/elements, board identity/version/fingerprint/refusal/hold/conflict/write receipts, panes, repositories/bindings, snapshots, change cursors, library ids, server state, claims, affected elements/documents, and pending artifacts. Each family owns named input, stage, result schemas, and inferred types beside its contracts. Use closed command-built shapes and intentionally loose forwarded server payloads; do not create a generic response envelope or second schema catalogue.

6. Before registering a fifth contract, make the checker and generator support the mixed registry. Project all 57 canonical paths with kind contract or legacy, reconcile path set/uniqueness/parentage/current owner/contract identity against the canonical audit, require contractCount plus legacyCount equals 57, and reject any ungenerated registered contract. Generate complete current contracts plus an explicit legacyPaths section and regenerate internal artifacts at every family checkpoint so test:contracts stays green. TASK-123.03 retains the released skill/chaining reference.

7. Rework the one commands/run.ts registry for longest-path dispatch. It becomes the sole command/subcommand catalogue and owns aliases/defaults, summaries, usage, and contract references. Preserve global help/version and first-occurrence stripping for --url, --board, --doing, and --expect-version. Represent repo/library/inject defaults and pane/board/snapshot/arrange namespace refusals explicitly. Keep Commander private. Add post-contact staged token validation and cached prerequisites to preserve server/browser-before-late-validation behavior without duplicate contacts.

8. Migrate server/local control vertically: start, stop, status, then install-skill. Preserve explicit start and startup notes, stop identity safety, all status variants, local prompts/filesystem ordering, print-source JSON, replacement/removal notes, diagnostic timing, and exits. Regenerate and run checkpoint gates.

9. Migrate basic element/scene writes: apply, add, delete, get, clear, and import. Preserve JSON/file/stdin phase order, import server-before-input behavior, board/doing/expect-version semantics, held/refusals, REST bodies/order, receipts, and current one-write behavior. TASK-126 owns atomic replace import changes.

10. Migrate read/view commands: selection, panes, describe, compare, and changes. Preserve text/JSON modes, no-pane success, cursor/coalesce/detail behavior, complete comparison payloads, source fields, server contact order, intentional loose forwarded data, and exits.

11. Migrate repo list/add/forget with its default-list alias, then inject status/test with default-status alias. Preserve ignored trailing inject-status argv, repository/cwd inference and diagnostics, local registration mutations, loopback/opt-in rules, REST behavior, shapes, and order.

12. Migrate pane open/close and its namespace refusal, then board list/info/new/open/save and its namespace refusal. Preserve recognized-subcommand-before-contact and remaining-validation-after-contact, pane open optional second board-open request, browser prerequisites, targeting/variants/reload/pane behavior, ADR 0012 save semantics, board-save outcome, REST order, write/refusal/held rules, and ADRs 0006/0009/0015/0016.

13. Migrate snapshot list/save/restore plus namespace refusal. Preserve server-before-name validation, exact result fields, snapshot read then board/force checks then clear/batch order, association, held/refusals, and current multi-request/write behavior. TASK-127 owns atomic restore.

14. Migrate promote/demote, claim/release, library list/insert with its default alias, and arrange align/distribute/group/ungroup/lock/unlock/duplicate plus namespace refusal. Preserve exact current receipts, phase ordering, selection defaults, binding resolution, lease semantics, generated ids/group handles, REST order, held/refusals/exits, and one-write guarantees; do not implement audit aspirations as new fields.

15. Migrate screenshot, mermaid, and share. Preserve browser/pane timing, raw SVG versus JSON/file modes, Mermaid local-read-before-contact order, share elements-only fetch, exact URLs, artifact validation-before-commit, and no partial output. Existing export and viewport remain compatibility references.

16. Before deleting legacy code, tighten the same checker to exactly 57 contracts, zero legacy, exact canonical paths, no family-owned subcommand catalogues, and current artifacts. Only after that gate passes, delete LegacyCommand and fallback routing, args.ts, util.ts, parseArgs/printJson/direct-stream paths, raw argv handlers, family switch dispatchers, duplicate catalogues, obsolete usage strings, and the proof definition monolith. Leave one all-contract registry and one parsing/prerequisite/validation/output/diagnostic/artifact/held/exit boundary; prove deletion with source/import guards.

17. Keep internal design, audit, proof, and help generation current in the same commits as registry changes. Document public outcomes, staged phases, schema ownership, diagnostics, and the final registry. Correct approximate audit entries from fixed-base source/goldens. Do not edit the released archboard skill or complete chaining reference; TASK-123.03 owns them after TASK-119 through TASK-121.

18. Commit rollback-safe checkpoints: baseline goldens; public outcome boundary and schemas; mixed-registry generator/checker; registry/adapter; then one conventional commit per migration family; final zero-legacy deletion and internal docs. At every family checkpoint run bun run fix, regeneration, test:contracts, test:cli, type-check, and focused suites. Run bun run check at foundation, midpoint, and final completion. Run a separate full bun run test after two byte-stable final fix passes. Keep browser suites sequential/headless. Require an independent contract-boundary review after the foundation and independent Standards/Spec review over 6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a..HEAD after zero-legacy completion; remediate and rereview the complete range until clean.

19. Use one gpt-5.6-sol/medium implementation worker with exclusive shared-worktree edit ownership. The registry, shared schemas, generator, golden, and deletion gates overlap too heavily for parallel editors. Read-only analysis may be delegated, but the worker serializes all registry edits, generation, validation, commits, and review remediation.

Approved decisions and compatibility policy:
- Fixed-base source behavior and byte/event goldens are authoritative where the earlier audit is approximate.
- Public declared nonzero outcomes and two diagnostic lanes are approved; immediate diagnostics alone may precede validation.
- The one 57-path registry explicitly models default aliases and namespace refusals.
- Current REST/write sequences remain unchanged, including multi-request pane open and current snapshot/import behavior.
- Internal generated artifacts are updated here; the released skill/chaining reference remains TASK-123.03 scope.
- No runtime/server/UI/shared/REST API change, no TASK-119/120/121/126/127/123.03 implementation, no dependency change, no public spelling/result/ordering cleanup, no follow-up task creation, and no weakening or skipping tests/lint/types/boundaries/browser gates.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 08:20
---
Planning started after TASK-123.01 completed and was pushed at 91ddd3d7acba1518a2726d7cd7aebb08e6b885ba. Implementation requires parent approval of the recorded plan.
---

author: @codex
created: 2026-08-26 08:49
---
Plan approved after independent high-stakes review and two focused amendment rounds. Implementation is authorized only within the recorded fixed-base compatibility, zero-legacy, validation, and protected-scope gates.
---
<!-- COMMENTS:END -->
