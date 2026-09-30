---
id: TASK-143.01
title: Own Codex threads through a typed app-server session
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-08-30 11:43'
updated_date: '2026-09-04 02:47'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for one exact owned Codex app-server child and typed session. TASK-143.08 replaces the rejected generated-private and handwritten-copy design before this milestone can finish. The shared generated-derived type module, runtime ingress schemas, session and thread-link state, browser gateway, production composition, and lifecycle policy must form one current-epoch authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The exact 0.151.0 generated app-server types are available through one shared module root and ordinary compilation derives every used request, response, notification, reverse request, item, config, thread, turn, queue, session, and realtime view from them.
- [x] #2 Only a current-child loaded thread with canAcceptDirectInput true forms an executable thread link; discovery, create, partial failure, reconnect, sign-in, crash, replacement, and outcome-unknown states remain explicit and non-executable when unsafe.
- [x] #3 The production canvas entrypoint instantiates one process, session, realtime, approval, tool, semantic, coordinator, queue, callback, and spoken-gate graph; kept state survives reload without retaining generation-bound instances.
- [x] #4 Runtime parsers prove generated-type conformance, mandatory child startup and shutdown are leak-free, and focused module plus public process owners replace fingerprint, mirror, copied-contract, and duplicate lifecycle scaffolding.
- [x] #5 At most one package-local codex app-server child or starting child belongs to an Archboard server at any time; reload reuses it, concurrent starts cannot duplicate it, and crash replacement waits for complete prior-process-group reaping.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Milestone verification of the 21 completed children
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Milestone verification at 65db721a (branch codex/task-143-01-milestone), working tree clean before and after.

Gate results, run in this worktree:
- bun run type-check: exit 0 (contract regenerated from the checkout-local @openai/codex 0.151.0; both the root and frontend TypeScript projects pass).
- bun run lint: oxlint exit 0, 0 warnings and 0 errors.
- bun run fmt:check: exit 0, 1052 files correctly formatted.
- bun run test:modules: 1962 pass / 0 fail, 18588 expect() calls across 219 files.
- bun run test:repository: 122 pass / 0 fail, 1060 expect() calls across 18 files.
- bun run test:system: 324 pass / 0 fail, 4907 expect() calls across 83 files (serial). The first attempt failed only because dist/frontend was absent; bun run build:frontend is part of the canonical bun run test sequence, and the rerun after it was clean. The serial browser lane was deliberately not run.

Per-AC evidence read from the branch, not only from the children's records:

AC #1. src/shared/codex-app-server-contract/index.ts is the one module root. It imports the 0.151.0 generated ts-rs output (generated/current -> generated/versions/version-0.151.0-recipe-1, 813 type files) and derives CodexClientRequest, CodexClientNotification, CodexServerRequest, CodexServerNotification, the four ParamsByMethod maps, CodexResponseByMethod, CodexServerResponseByMethod, CodexThreadStatus, CodexTurnStatus and the approval decisions through CodexJsonWire plus Extract/Pick/NonNullable. CODEX_CLIENT_REQUEST_METHODS (32) and CODEX_SERVER_REQUEST_METHODS (11) are 'as const satisfies' the generated keys. Every runtime ingress schema family is compile-time bound to those generated wire types through codexIngressSchemas (src/runtime/codex-protocol/lib/vendor-schema.ts): RESPONSE_SCHEMAS, CLIENT_REQUEST_PARAM_SCHEMAS, SERVER_REQUEST_SCHEMAS, CLIENT_NOTIFICATION_SCHEMAS, SERVER_NOTIFICATION_SCHEMAS, plus codexOutputSchema/codexIngressSchema in authored.ts and server-response-schemas.ts. Item, config, thread, turn, queue, session and realtime views reach the same check by composition into those maps, and the exported types are z.infer of the checked schemas. Cross-checking the 813 generated type names against every interface/type declared under src/runtime/codex-*, src/server/codex-workbench and src/server/canvas leaves 16 name collisions, and every one is an alias or a z.infer of a conformance-checked schema (for example src/runtime/codex-protocol/lib/authored.ts LoginAccountParams = CodexLoginAccountParams, src/runtime/codex-session/lib/storage-proof.ts InitializeResponse = ResponsePayloads['initialize']): no handwritten copy of a generated shape exists in either tree. Local identities stay visibly local through BrandIdentityField/BrandedRequestParams in client-request-schemas.ts, and the browser model in src/shared/codex-browser-model is a separately named model fed from CodexResponseByMethod at one seam. The generated tree is derived and gitignored (.gitignore line 19); scripts/generate-codex-app-server-contract.ts refuses any @openai/codex that is not the checkout-local 0.151.0.

AC #2. src/runtime/codex-thread-link/lib/contract.ts makes it a type-level fact: ExecutableThreadLink pins loaded: true and canAcceptDirectInput: true, InspectOnlyThreadLink pins canAcceptDirectInput: false with a required reason, and UnboundThreadLink is separate. linkFor in lib/classifier.ts builds an executable link only when the refusal precedence returns null and re-guards source, executable status and a live current epoch, throwing otherwise. Owners: src/runtime/codex-thread-link/tests/classifier.test.ts ('keeps notLoaded, systemError, false, and null capability refusals distinct', 'returns stale-child and prior-epoch before lower list reasons', 'returns inspect-only when no active epoch exists or the live epoch changes', 'fails classification when a page transport cannot be exhausted'), precedence.test.ts ('keeps stale child ahead of every lower condition', 'keeps prior epoch ahead of every lower condition', 'keeps ordinary outcome-unknown and missing ownership below settlement loss'), discovery.test.ts ('retains stale and outcome-unknown durable provenance as inspect-only', 'rejects an epoch-manifest change during discovery', 'rejects a repeated cursor from either inventory without a partial result'), binding.test.ts ('rejects a fabricated executable link at the standalone factory', 'stores inspect-only links explicitly but cannot upgrade them by CAS', 'default classify-and-bind keeps a stale child inspect-only'), adoption-races.test.ts. Create and sign-in are held by src/runtime/codex-workhorse-start/lib/validation.ts with codex-workhorse-start/tests/lifecycle.test.ts, and src/runtime/codex-session/tests/session.test.ts ('keeps account readiness separate from login start and gates thread methods'); crash and replacement by src/runtime/codex-epoch/tests/epoch.test.ts ('makes replacement children inspect-only and rejects late old writers').

AC #3. src/server.ts -> src/server/canvas/index.ts -> lib/application.ts, whose createCanvasApplicationLifetime declares one mandatory 'codex-workbench' stage (application.ts:5224) running prepareCodexWorkbench/stopCodexWorkbench; prepareCodexWorkbench builds exactly one createCanvasCodexWorkbenchApplication over createCanvasCodexWorkbenchInstallation. installProductionCodexWorkbench (src/server/canvas/lib/codex-workbench.ts) owns the single createCodexProcess and one kernel (identity ledger plus transport), and createProductionCodexWorkbenchFactories builds the rest. tests/system/repository-policy/codex-workbench-composition.test.ts derives its required-owner set from keyof CodexWorkbenchComponents and asserts each of epoch, transport, session, threadLink, workhorse, semanticPublisher, realtime, approvals, dynamicTools, semanticDelivery, coordinator, queue, operations, spokenApproval, coordinatorTools, callbacks and gateway is constructed exactly once, plus the five dynamic adapters ('the production factories construct every required owner exactly once'). src/server/canvas/tests/codex-workbench-generation.test.ts drives the installed listener across CODEX_SERVER_REQUEST_METHODS and proves ordered construction and shutdown. The 'survives reload' clause is vacuous under ADR 0021, which removed backend hot reload; the substantive guarantee is proven against generation retirement and crash replacement by codex-workbench-production-initialization.test.ts ('a settled or replaced generation leaves no reachable owners behind', 'retiring a generation releases its owned-process readiness subscription', 'child-exit settlement aborts the generation live dynamic waits').

AC #4. Ingress conformance is the same compile-time binding described under AC #1, with normalizeCodexJsonWire running before any handwritten parser. Leak-free mandatory startup and shutdown: tests/system/process-contracts/codex-workbench-lifecycle.test.ts, codex-workbench-termination.test.ts, codex-workbench-normal-close.test.ts, codex-workbench-interruptions.test.ts, codex-workbench-outcomes.test.ts, resource-cleanup.test.ts (8 owners including 'every dynamic owner establishes lexical disposal before its first acquisition' and 'sanitized child environments retain only approved state'), application-lifetime-terminal-stop.test.ts, plus module owners src/server/canvas/tests/codex-workbench.test.ts, codex-workbench-application.test.ts and codex-workbench-terminal-cleanup.test.ts. No retired scaffolding remains: no fingerprint corpus, mirror detector, alias corpus, module-scope analyzer, kept() registry, reload token or canary exists under src, tests or scripts; src/server/canvas/lib/codex-workbench-retained-policy.ts is gone; tests/system/repository-policy/analysis-safety.test.ts keeps --type-aware, tsgolint and oxlint-tsgolint out of every script, config and owner; @babel/parser survives only in the opt-in wall-clock policy support, not in any contract check.

AC #5. src/runtime/codex-process/lib/executable.ts resolveProjectCodexExecutable resolves @openai/codex/bin/codex.js and refuses anything outside this checkout's node_modules, so the child is package-local. lib/storage.ts takes an exclusive O_EXCL ('wx') lock at <CODEX_HOME>/.archboard-codex-process.lock and releases it on unwind. lib/process.ts serializes starts: start() returns the single in-flight startPromise while running or starting, awaits stopPromise while stopping, and refuses after terminal failure, so concurrent starts cannot duplicate the child. Crash replacement enters state 'group_cleanup' and only schedules a restart after ensureGroupCleanup for the exact prior record resolves. Owners: tests/system/process-contracts/codex-workbench-crash-replacement.test.ts ('production crash revokes dispatch and replaces only after the exact prior group is gone'), codex-workbench-storage.test.ts ('refuses env-only, null, redirected, symlinked, and conflicting stores', 'isolates two live production homes and child processes'), src/server/canvas/tests/codex-workbench.test.ts ('replaces a retired child only after the prior graph finished', 'stops the owned child when generation startup fails'), and src/runtime/codex-epoch/tests/epoch.test.ts ('refuses a live competing process through the durable lease'). The 'reload reuses it' clause is vacuous under ADR 0021.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Archboard now owns one Codex task end to end through a typed app-server session, and this milestone is the composition of its 21 completed children rather than code of its own.

What the branch holds. One shared module root, src/shared/codex-app-server-contract, exposes the exact generated 0.151.0 ts-rs types and derives every request, response, notification, reverse request, item, config, thread, turn, queue, session and realtime view from them; ordinary tsc is the enforcement, and every handwritten ingress schema is bound to its generated wire type by codexIngressSchemas rather than copied from it. A pane reaches Codex only through a thread link whose executable arm is a type-level fact (loaded: true, canAcceptDirectInput: true) that the classifier can construct only after an exhausted two-inventory join, a live current epoch, an allowed source and an executable status; everything else, including discovery, create, partial page failure, reconnect, sign-in, crash, replacement and outcome-unknown, lands in an inspect-only arm carrying its reason. The production canvas entrypoint instantiates that graph once through a single mandatory codex-workbench lifetime stage, and the child is one package-local process under an exclusive store lock whose replacement waits for the exact prior process group to be reaped.

Why it is finished. Each of the five acceptance criteria was re-derived from the branch, not accepted from the children's records. Two clauses are satisfied vacuously and are recorded as such: 'kept state survives reload' in AC #3 and 'reload reuses it' in AC #5 no longer describe anything, because ADR 0021 removed backend hot reload and the only reload is a full restart. The substantive guarantees those clauses were written for are proven instead against generation retirement, child exit and crash replacement.

How it was verified. Full gates in this worktree at 65db721a with a clean tree: type-check passes both TypeScript projects after regenerating the contract from the checkout-local @openai/codex 0.151.0; oxlint 0 warnings and 0 errors; oxfmt clean on 1052 files; bun run test:modules 1962 pass / 0 fail across 219 files; bun run test:repository 122 pass / 0 fail across 18 files; bun run test:system 324 pass / 0 fail across 83 files serially, after the bun run build:frontend step the canonical bun run test sequence performs. The serial browser lane was out of scope. Named owners per criterion are in the implementation notes; the load-bearing ones are src/runtime/codex-thread-link/tests/{classifier,precedence,discovery,binding}.test.ts, tests/system/repository-policy/codex-workbench-composition.test.ts, src/server/canvas/tests/{codex-workbench-generation,codex-workbench-production-initialization,codex-workbench}.test.ts, and tests/system/process-contracts/{codex-workbench-crash-replacement,codex-workbench-storage,codex-workbench-lifecycle,resource-cleanup}.test.ts. Reading the source also confirmed no handwritten copy of a generated shape in src/runtime/codex-* or src/server/codex-workbench, and no surviving fingerprint, mirror, copied-contract or hot-reload scaffolding.
<!-- SECTION:FINAL_SUMMARY:END -->
