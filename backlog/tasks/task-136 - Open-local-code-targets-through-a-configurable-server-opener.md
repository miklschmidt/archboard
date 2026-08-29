---
id: TASK-136
title: Open local code targets through a configurable server opener
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 15:35'
updated_date: '2026-08-29 10:21'
labels: []
dependencies:
  - TASK-130.11
references:
  - >-
    docs/adr/0018-code-targets-resolve-at-presentation-and-local-opening-is-a-server-capability.md
documentation:
  - CONTEXT.md
type: feature
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person activating code that exists in a registered checkout can open its file or directory through the loopback Archboard server. One machine-wide opener is configurable from the frontend and never turns portable board metadata into a machine-specific path or command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The frontend has a global opener settings panel with the platform-native default, editor presets, custom executable and argv fields containing {path}, validation, reset, and a test against a chosen registered checkout root
- [ ] #2 Opener configuration is stored as machine state outside the vault, survives a server restart, and a saved change applies to every pane on the next activation without reloading
- [ ] #3 A local code-target activation sends board and element identity through a same-origin POST; GET, cross-origin requests, browser-supplied absolute paths, and elements without a resolvable binding open nothing
- [ ] #4 Before launching, the server re-reads the canonical binding, verifies the registered checkout still has the recorded repository identity, accepts existing files and directories, and rejects real paths that escape through a symlink
- [ ] #5 The server launches the configured executable with an argument array and no shell; the platform-native default works on each supported host or returns an actionable unavailable error
- [ ] #6 A successful activation leaves the canvas open, while launch failure names what failed, links to opener settings, and offers an explicit GitHub action when runtime presentation can derive one
- [ ] #7 Automated checks exercise the public settings and activation contracts, process launch with a controlled fake opener, file and directory targets, refusals, persistence, and immediate cross-pane application
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Value, scope, dependency, and approval gate. The affected person is the one using the canvas who wants a bound local target to open in one machine application without leaving or reloading the board. The observable improvement is one machine-wide opener selection, durable outside the vault, applied on the next activation by every caller. Keep the product to one server-owned setting, one protected activation route, one exact internal URL contract, one settings dialog, and one canonical local resolver. Add TASK-130.11 as a hard dependency. Do not begin implementation until TASK-130.11 is integrated, TASK-136 is rebased onto it, and an independent reviewer approves this amended plan. Do not concurrently touch TASK-130.11's package, browser inventory, application integration, or test-suite documentation. TASK-136 does not change presentation.ts, so binding presentation remains file:// until TASK-137. It does not add GitHub derivation, change board serialization, store per-pane opener state, or persist a command/path in a note.

2. Shared wire and reserved-link contract. Add src/shared/code-target/index.ts as the dependency-neutral contract for server and UI. Define strict Zod schemas and inferred types for OpenerSelection, settings/test requests and replies, CodeTargetOpenRequest, CodeTargetOpenSuccess, CodeTargetOpenFailure, their discriminated CodeTargetOpenReply union, stable refusal codes, and notice actions. All request objects reject unknown keys. All success and non-2xx response bodies are parsed through these shared schemas in src/ui/canvas/api.ts; no response is trusted through a cast, and an invalid error body becomes a typed protocol failure.

Reserve exactly the relative URL /api/code-targets/open?board=<encoded>&element=<encoded>. One builder emits it and one strict parser accepts only a leading-slash relative URL with that exact pathname, exactly one nonempty board and element query value, no other or duplicate parameter, no fragment, and no scheme or authority. It contains identity only, never a binding, repository, absolute path, executable, argv, or GitHub URL. TASK-136 does not produce this URL from a real binding. Only the exact reserved shape is intercepted; every other link remains ordinary. The UI module defines exact handler callbacks onSuccess: (reply: CodeTargetOpenSuccess) => void and onFailure: (notice: CodeTargetNotice) => void, plus the exact CanvasPane-to-Shell prop onCodeTargetNotice: (notice: CodeTargetNotice) => void. CodeTargetNotice is a typed error notice with readonly actions drawn from { kind: "settings"; label: "Opener settings" } and { kind: "github"; label: string; href: GitHubHttpsUrl }; GitHubHttpsUrl is inferred from a shared Zod refinement that accepts only https URLs whose hostname is exactly github.com. The GitHub action slot is reserved, but TASK-136 never derives or emits it.

3. One canonical local resolver. Add src/runtime/code-target/index.ts with a small public root. resolveRegisteredCheckout(repository) re-reads the registry, realpaths its root, proves repoRootOf(realRoot) is that root, and compares repoIdentityAt(realRoot) with the binding repository identity. resolveLocalCodeTarget(binding) rejects a missing repository/path, an absolute or lexical .. escape, missing target, non-file/non-directory target, stale checkout identity, and any target whose realpath leaves the canonical root. File and directory symlinks are accepted when their realpaths stay inside that root; file and directory symlink escapes are rejected. The checkout root, ordinary files/directories, and in-root symlinks all resolve to the canonical real target passed to the launcher, preventing a post-validation symlink argument from redirecting the command. Return typed success/refusal data. TASK-137 must reuse this resolver rather than create another containment or identity policy.

4. Machine state, defaults, and no-shell launch. Add src/server/code-opener/ with root index.ts and private configuration.ts, launch.ts, browser-csrf.ts, and routes.ts. The versioned record lives at ARCHBOARD_OPENER_CONFIG for isolated tests/second instances, otherwise <stateDir()>/opener.json. Read the selected path and JSON for every settings request, test, and activation; do not cache it in module scope, kept(), a pane, or a frontend store. Before the first atomic save or reset, synchronously mkdir the parent recursively, then use writeFileAtomic. Missing state means { version: 1, kind: "platform" }. Malformed existing state yields OPENER_CONFIG_INVALID and is never silently replaced; reset can recover it by atomically writing the platform record. Nothing is stored in the vault.

Keep default and custom command expansion as pure data before process execution. Cover darwin -> open {path}, linux -> xdg-open {path}, win32 -> explorer.exe {path}, an unsupported platform -> OPENER_PLATFORM_UNSUPPORTED, and custom executable/ordered argv substitution in pure-data tests. Presets are VS Code code {path}, Cursor cursor {path}, and Zed zed {path}. Custom input requires a nonblank absolute executable or bare PATH name, at most 32 argv strings/16 KiB total, no NUL, and exactly one {path} token across argv; cwd-relative paths containing separators are invalid. Resolve a bare name with Bun.which and validate an absolute executable. Spawn the resolved executable with the substituted canonical real target as an argument array using spawn(executable, argv, { shell: false, detached: true, stdio: "ignore", windowsHide: true }). Resolve activation after spawn/error, remove listeners, and unref without waiting for the opened process. Missing commands and spawn errors identify the executable and return an actionable settings remedy.

5. Exact API and browser-CSRF boundary. Mount the module behind the existing application integration and write-boundary policy. Add only POST /api/code-targets/open to NOT_A_BOARD_WRITE with the explicit reason that it reads canonical board state and launches a process but writes no note. Expose:
- GET /api/settings/opener: current selection, effective command, availability, default/presets, and registered checkout choices with repository, root, existence, and current identity status.
- PUT /api/settings/opener: strict OpenerSelection validation and atomic save.
- DELETE /api/settings/opener: recoverable platform reset.
- POST /api/settings/opener/test: strict { selection, repository }; revalidate the registered checkout and launch only its canonical root, accepting no root/path from the browser and not saving the draft.
- POST /api/code-targets/open: strict { board, element }; re-read the open board note through readBoardContent, locate the element, read only its canonical customData.archboard.binding, revalidate repository/root/identity/target, re-read machine settings, and launch.
There is no GET activation route. GET /api/code-targets/open is 404 and never reads config/note state or spawns. No activation request accepts a query-derived path, presentation copy, binding, repository, executable, or argv. Success returns repository-relative identity and file/directory kind, never an absolute target.

Use one private browser-CSRF helper before body parsing, config access, note access, or spawn. Parse Host as a URL authority and Origin/Referer as URLs; take the hostname, lowercase it, and normalize a single IPv6 bracket pair without splitting on colon, so bracketed IPv6 and optional ports are handled. Accept only exact localhost, 127.0.0.1, or ::1 hostnames. Every browser route requires a loopback Host and Sec-Fetch-Site exactly same-origin. PUT, DELETE, and both POST routes additionally require a present, non-null loopback Origin; Referer never substitutes for a mutation Origin. Settings GET accepts a loopback Origin, or only when Origin is absent, a loopback Referer. Reject non-loopback Host first; reject absent/null/non-loopback mutation Origin and absent/same-site/cross-site Sec-Fetch-Site before config/note/spawn. Contract tests cover production Host/Origin on 127.0.0.1:3000, the Vite proxy tuple Host 127.0.0.1:3000 plus loopback Origin :5173 with Sec-Fetch-Site same-origin, and [::1]:port Host/Origin. Remove the legacy global Access-Control-Allow-Origin response header from every guarded route response; a preflight may be answered globally but cannot read or mutate opener state. The guard is browser CSRF protection, not authentication against a local process capable of forging headers; document and test that exact claim instead of implying provenance or trust.

Use stable response codes: 400 strict input/protocol error, 403 CROSS_ORIGIN_REFUSED, 404 missing board/element or GET activation, 409 CHECKOUT_IDENTITY_CHANGED, 422 missing/unresolvable binding, unavailable target, containment refusal, invalid/unavailable opener, and 500 unreadable machine state or spawn failure. Every failure opens nothing.

6. Frontend handler, settings UI, and failure UX. Add src/ui/code-target/index.ts using NonNullable<ExcalidrawProps["onLinkOpen"]>. CanvasSession exposes the exact current boardKey. On an exact reserved link, the handler synchronously preventDefault(), verifies the URL board equals that pane's boardKey and URL element equals the clicked element id, then calls the relative same-origin POST through src/ui/canvas/api.ts. A context mismatch is prevented, makes no fetch, and calls the typed failure callback. A schema-valid 2xx calls typed onSuccess once; a schema-valid non-2xx calls typed onFailure once. Success does not navigate, reload, or replace the canvas.

Add an owner-local src/ui/code-target/tests/link-handler.test.ts through the module root. It directly proves synchronous preventDefault, strict URL parsing, board and element matching, zero fetch on context mismatch, exact POST URL/method/body on a match, shared-schema parsing, and typed success/failure callback routing. It also proves a non-exact URL returns without prevention or fetch. This is a unit contract only; real ordinary-link coexistence belongs to TASK-137.

Add a gear action in BoardBar and global OpenerSettingsDialog under src/ui/opener-settings/. It loads fresh server state on every open; shows platform default and availability, three presets, custom executable plus ordered argv add/remove rows, inline client validation, authoritative server validation, registered checkout root choices with stale/empty guidance, Test opener, Reset to system default, Cancel, and Save. Test uses an unsaved draft and a selected registered repository; it never accepts a browser path. Save closes with copy stating every pane/caller uses the saved choice on the next activation. Reset stays available for malformed state.

Shell owns typed notice rendering. CanvasPane receives exactly onCodeTargetNotice: (notice: CodeTargetNotice) => void and passes handler failures upward. The notice names the failure and renders an Opener settings action. A GitHub action renders only from a shared-schema-valid controlled reply containing an https://github.com/ URL and opens with noopener,noreferrer; TASK-136 has no producer and never silently falls back. The browser owner tests the settings UI and this typed notice/action rendering with a controlled response. It does not claim a real binding click, real file/directory activation, ordinary-link coexistence, or two-pane browser activation.

7. Public system contracts and immediate machine-wide behavior. Split tests/system/code-targets/settings-contract.test.ts and activation-contract.test.ts into independent owners, each with a hard stop at 480 physical lines. settings-contract owns public GET/PUT/DELETE/test behavior, strict/default/preset/custom request validation, checkout-root test, corrupt/reset state, browser-CSRF matrices, and no vault writes. The pure darwin/linux/win32/unsupported default plans and custom launch substitution are owned only by src/server/code-opener/tests/configuration.test.ts, not repeated through the system route owner. activation-contract owns canonical board/element re-read, strict request shape, file/directory/in-root-symlink success, lexical and realpath escape refusals, changed checkout identity, missing board/element/binding/path, GET 404/no-spawn, no-shell metacharacter sentinel, unavailable/spawn error, and no note mutation. Both use only public HTTP contracts for route behavior.

opener-persistence.test.ts owns machine-state durability and immediate application. Save selection A, activate through caller one, save B, then activate through two independently constructed browser-header callers without reload and require both captures to use B. Await the owned canvas restart, then re-read canvas.base, construct a caller from the new base, and require B again; never assume or assert the same port. Assert the config path is outside the vault and notes contain no opener/executable/argv/absolute/internal URL. Browser two-pane proof is deferred to TASK-137.

8. Controlled fake opener and isolated lifecycle. Keep all support under tests/system/code-targets; do not add a shared framework or change tests/system/support. fake-opener.ts writes exactly one per-process capture record with O_EXCL before doing anything else. Immediate mode exits after capture. Hold mode waits for an invocation-specific release marker with bounded polling, writes its exit evidence, and self-exits at the shared timeout if never released. Every test registers release signaling, capture/exit cleanup, and temp-root disposal in AsyncDisposableStack before activation. PIDs and process-group values are evidence only, never kill authority. Cleanup signals release and waits within the same bounded budget; it never calls kill using a captured PID. The self-timeout is the last resource backstop.

launcher-lifecycle.test.ts is a separate isolated owner. It proves an HTTP activation returns while the hold-mode fake still runs. A local launcher-owner fixture then invokes the public launcher and exits while its fake remains held, proving unref. On Linux, read the captured process evidence and /proc stat to require the detached fake owns its process group. Signal release, await the fake's exit evidence and observed death, and require no captured child/listener/temp root remains. Non-Linux runs the response/unref/release assertions and skips only the Linux process-group assertion. No real desktop opener runs.

Reuse existing timing values where their contract fits. If a dedicated lifecycle budget is required, add exactly these two formatted lines to src/shared/timing/timing.ts, taking it from 497 to 499:
    /** Fake opener lifecycle poll and self-exit cap; process owners outlive both. */
    export const TEST_OPENER_LIFECYCLE = { pollMs: 20, timeoutMs: 2_000 } as const;
Do not add any other timing line.

9. TDD and mutation proof. Write the shared-schema, UI-handler, resolver/configuration, split public system contracts, persistence, lifecycle, and browser owner before their production slices, and record the expected missing-contract/404/missing-UI red failures. Implement in this order: shared schemas and strict reserved-link parser, resolver, configuration/default planning, no-shell launcher, exact CSRF guard/routes, owner-local link handler, settings UI, typed notices. After green, apply and revert one mutation at a time: accept body path; reuse presentation binding instead of canonical note re-read; remove identity comparison; use lexical/stat-only containment; reject directories/in-root symlinks; cache config across requests/restart; accept same-site/absent Origin or Host; add GET activation; allow zero/two {path}; parse non-2xx without Zod; or use a command string/shell. The named stale-binding, identity, symlink, directory, two-caller/restart, CSRF, GET/no-spawn, protocol, validation, and metacharacter/sentinel owners must fail. Do not weaken lint, types, test inventory, or existing assertions.

10. Exact ownership and projected line ceilings. Every new authored TypeScript file stays below 500, with these hard owner limits:
- src/shared/code-target/index.ts 207 at the fixed base -> <=220; src/shared/code-target/tests/contract.test.ts <=220.
- src/runtime/code-target/index.ts <=220; tests/support.ts <=170; tests/resolution.test.ts <=320.
- src/server/code-opener/index.ts <=80; lib/configuration.ts <=260; lib/launch.ts <=150; lib/browser-csrf.ts <=150; lib/routes.ts <=360; tests/configuration.test.ts <=320.
- src/ui/code-target/index.ts <=150; tests/link-handler.test.ts <=260.
- src/ui/opener-settings/index.tsx <=35; lib/OpenerSettingsDialog.tsx <=380; opener-settings.css <=230.
- tests/system/code-targets/support/opener-fixture.ts <=360; fixtures/fake-opener.ts <=90; fixtures/launcher-owner.ts <=100; settings-contract.test.ts <=480 hard stop; activation-contract.test.ts <=480 hard stop; opener-persistence.test.ts <=340; launcher-lifecycle.test.ts <=400.
- tests/system/browser/opener-settings.test.ts <=460.

Existing under-500 owners remain under 500: src/ui/canvas/api.ts 358 -> <=460, CanvasPane.tsx 186 -> <=225, BoardBar.tsx 226 -> <=255, Icons.tsx 101 -> <=115, tests/system/browser/support/agent-browser.ts 381 at this base -> <=430, tests/system/repository-policy/test-inventory.test.ts 447 at this base -> <=490, package.json 83 at this base -> <=110, and docs/agents/test-suite.md 304 at this base -> <=340. timing.ts follows the exact 497 -> 499 rule in step 8. Existing legacy large owners receive diff caps only: application.ts +18, useCanvasSession.ts +12, and Shell.tsx +70; do not broaden them. Environment clearing adds only ARCHBOARD_OPENER_CONFIG to agent-browser.ts and the existing process/CLI/install/repository fixture env ownership. Do not edit ADR-0018, CONTEXT.md, presentation.ts, board serialization, TASK-134's element type modules, generated artifacts, or any file owned concurrently by TASK-130.11.

11. TASK-130.11 integration and overlap. After TASK-130.11 is integrated and TASK-136 is rebased, append tests/system/code-targets exactly once to test:system after tests/system/process-contracts. The exact selector is:
bun test --isolate --max-concurrency=1 tests/system/support tests/system/boards tests/system/label-geometry tests/system/cli tests/system/board-inspection tests/system/canvas-state tests/system/process-contracts tests/system/code-targets

Append tests/system/browser/opener-settings.test.ts exactly once after claim-interaction in test:serial-browser. The exact selector is:
bun tests/system/browser/run-browser-lane.ts tests/system/browser/human-edit-performance.test.ts tests/system/browser/fixed-point-document.test.ts tests/system/browser/malformed-geometry-recovery.test.ts tests/system/browser/pane-telemetry-recovery.test.ts tests/system/browser/arrow-binding-differential.test.ts tests/system/browser/finding-export.test.ts tests/system/browser/shell-layout.test.ts tests/system/browser/typed-text.test.ts tests/system/browser/live-session-convergence.test.ts tests/system/browser/server-update-ordering.test.ts tests/system/browser/hold-generation.test.ts tests/system/browser/human-hold-persistence.test.ts tests/system/browser/claim-interaction.test.ts tests/system/browser/opener-settings.test.ts

Append that browser path after claim-interaction in BROWSER_TEST_PATHS in the same order. Update the hard-coded browser diagnostic/count from 13 to 14 and update tests/system/repository-policy/test-inventory.test.ts to prove the opener system directory and browser owner each appear exactly once, with missing, duplicate, reordered, or wrong-lane cases rejected. Update docs/agents/test-suite.md with the code-target system owner, opener browser owner, controlled-process cleanup, focused commands, and exact final selector order. Do not restore transitional keys or old paths. No TASK-136 package, application, browser inventory, inventory test, or test-suite doc edit begins while TASK-130.11 is active.

TASK-134 owns canonical Excalidraw/UI element types. Avoid its types.ts, src/ui/types/index.ts, and src/ui/canvas/elements.ts. If it changes CanvasPane first, consume its vendor-derived type and apply only the link handler/notice prop. TASK-137 owns changing presentation away from file://, real binding-click file and directory activation, ordinary-link coexistence in the browser, browser two-pane activation, and real GitHub fallback production. TASK-136 supplies the strict reserved-link schemas/handler, resolver, protected HTTP contracts, opener state/launcher, and typed notice action slot without implementing those TASK-137 behaviors.

12. Validation order and explicit TASK-137 handoff. After approved implementation and the required rebase, run sequentially:
1) bun test --isolate src/shared/code-target src/runtime/code-target src/server/code-opener src/ui/code-target
2) bun test --isolate --max-concurrency=1 tests/system/code-targets
3) bun test --isolate tests/system/repository-policy/test-inventory.test.ts
4) bun test --isolate tests/system/process-contracts/write-boundary-policy.test.ts tests/system/boards/public-http-refusals.test.ts tests/system/cli/repository-resolution.test.ts
5) bun run type-check
6) bun run build
7) bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/opener-settings.test.ts
8) bun run test:modules
9) bun run test:system
10) bun run test:repository
11) bun run test:serial-browser
12) bun run test
13) bun run check
14) git diff --check
Never overlap browser, hot-reload, or opener process owners. Audit live children/listeners, capture/release files, temp state/vault roots, and the once-only test inventory after their owning lanes.

The TASK-137 handoff contract is explicit: consume the exact builder/parser and Zod wire schemas from src/shared/code-target, the canonical resolver from src/runtime/code-target, POST only board/element to the protected activation route, and use the typed CanvasPane handler/notice action boundary. TASK-137 alone replaces eligible file:// presentation with the reserved identity URL, supplies validated GitHub actions, and proves real binding clicks for file and directory targets, ordinary links remain ordinary, and two browser panes use a changed setting on their next activations. It must not accept client paths, duplicate containment/identity checks, cache opener state, or broaden the exact intercepted URL shape.

13. Current fixed-base tranche. Implementation base is aea77fac92c35c960e66e8aadc26e47a12c81a6d, which contains the review-clean TASK-130.11 selectors recorded in step 11. While TASK-134 performs the semantic element-type cutover, this tranche owns only disjoint shared code-target schemas, runtime resolver and containment, server opener configuration/planning/launcher/CSRF/routes, their module tests, and tests/system/code-targets support and non-browser contracts. It must not edit CanvasPane, Shell, UI integration, src/server/canvas/lib/application.ts, package.json, browser inventory/adapter/path lists, docs/agents/test-suite.md, or any TASK-134-owned file. Route mounting, package/browser inventory registration, UI work, and full/browser lanes stay serialized for the post-TASK-134 reconciliation. Focused owners may exercise an isolated Express router through its public HTTP contract, but they do not claim production mounting before that reconciliation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation fixed base: aea77fac92c35c960e66e8aadc26e47a12c81a6d (TASK-130.11 integrated). Current phase is the disjoint shared/server/system-test tranche; TASK-134 overlap remains serialized.

Disjoint tranche checkpoint:
- 0566040 feat(code-target): add strict local resolution contracts
- 946cfdb feat(opener): add guarded machine launcher contracts
- Completed shared Zod/URL contracts, registry-backed realpath resolver, machine config, pure platform/custom planning, no-shell launcher, exact CSRF helper, isolated HTTP router, controlled fake opener, settings/activation/persistence/lifecycle owners.
- Focused owners, type-check, full test:modules, focused code-target system directory, full lint, and repository-wide format check pass. Realpath, same-site CSRF, and shell mutations each failed their owner and were reverted.
- Remaining serialized work: production application mount/write exemption, package and once-only inventory registration, browser adapter/list/docs, UI handler/settings/notice integration, TASK-134 reconciliation, browser/full lanes, and TASK-137 presentation handoff. No protected file was edited in this tranche.

Checkpoint review remediation (fixed base aea77fac92c35c960e66e8aadc26e47a12c81a6d; source commit 890547e):
- Settings GET now returns strict current selection, effective resolved command, and typed availability using the same resolver used by launch; available and unavailable selections are proved without spawn.
- A default-dependency public HTTP owner reads a canonical binding from a real isolated board note and proves exact note bytes and mtime remain unchanged.
- Reserved URLs reject backslashes before WHATWG parsing; Windows containment rejects absolute cross-drive relative results.
- PUT and settings test pre-read machine state and preserve corrupt bytes; DELETE remains the sole recovery. Owned malformed JSON replies are shared-schema REQUEST_INVALID 400 responses, while the CSRF guard still rejects before parsing or state/note/spawn work.
- Fake opener capture/release/death uses one retained deadline; every lifecycle owner observes child death, with Linux detached process-group evidence and no PID kill authority.
Validation: affected owners alone 48/48; modules 344/344; tests/system/code-targets 32/32; type-check, lint, fmt:check, and git diff --check pass. Focused mutations were killed for backslash interception, cross-drive containment, and corrupt-state PUT overwrite. All changed owners are <=285 lines (hard stop 480). Cleanup audit found no archboard-opener-system temporary roots or fake-opener processes. Serialized CanvasPane/Shell/application.ts/package/browser/docs integration remains paused.

Complete-range checkpoint closure (source commit 203d9e1):
- Reduced src/shared/code-target/index.ts to its approved 220-line cap without changing its public schema/URL responsibility. Moved the real-note/default-dependency case into activation-contract.test.ts and deleted the unapproved canonical-activation owner; activation-contract is 319/480 lines.
- Owned JSON parser failures now map charset/encoding, parse, size, verify, abort, content-length, and stream failures to shared-schema REQUEST_INVALID HTTP 400. Guarded oversized JSON and an unsafe oversized request prove response typing and guard-first ordering.
- saveOpenerSelection now refuses corrupt existing machine state at the exported module boundary; exact bytes survive save and reset remains the sole recovery.
- Lifecycle liveness/death evidence no longer calls process.kill. Linux reads /proc, Windows uses tasklist, and other supported hosts use ps under the one retained deadline; Linux keeps detached process-group evidence.
- Activation owns an injected OPENER_SPAWN_FAILED branch with exact shared-schema HTTP 500/settings action, no fake capture, and byte/mtime-stable state.
- Persistence now creates and inspects a valid note in an isolated vault, proves config containment outside that vault, and preserves exact note bytes/bigint mtime across both saves, independent callers, and restart with no opener/executable/argv/absolute/internal URL leakage.
Validation: affected owners alone 64/64; combined module owners 58/58; tests/system/code-targets 34/34; type-check, lint, repository fmt:check, and git diff --check pass. Focused red/mutations caught oversized-body mapping removal, module-level corrupt save overwrite, and spawn-failure status removal. Owner caps: shared 220/220, routes 286/360, settings 275/480, activation 319/480, support 293/360, persistence 105/340, lifecycle 78/400. No process.kill references, opener/code-target temp roots, fake opener, or launcher-owner processes remain. Serialized CanvasPane/Shell/application/package/browser/docs/TASK-137 integration remains paused.

Final Spec closures (source commit cbe028c):
- opener-persistence now captures the prior ARCHBOARD_VAULT, creates an isolated owned vault, sets the env before the first dynamic board/router import and server creation, disposes callers/process fixtures, restores or deletes the env exactly, then removes the vault. The test proves restoration after the registered cleanup block. Its valid note keeps exact bytes and bigint mtime across both saves, independent callers, and restart; config is outside that exact vault; process.execPath, checkout, config, every configured argv value, and /api/code-targets/open are absent from note bytes.
- activation-contract replaces the injected high-level spawn failure with a real X_OK executable whose shebang names a missing interpreter. Public activation traverses launchOpener and the ChildProcess error event, schema-parses exact HTTP 500/OPENER_SPAWN_FAILED/settings action, names the executable, creates no fake capture, and preserves exact note/config bytes and bigint mtimes.
- src/shared/code-target exports OpenerSelectionReply and OpenerTestReply as z.infer aliases while remaining 220/220 lines.
Validation: affected owners alone 38/38; combined module owners 58/58; tests/system/code-targets 34/34 with 175 expectations; type-check, lint, repository fmt:check, and git diff --check pass. Deliberate reds proved removal of the isolated-vault assignment inherited /home/msc/Work/Platform-Architecture/architecture-vault, and changing the real launcher error-event code changed the public response from 500 to 422. Final caps: shared 220/220, activation 368/480, persistence 117/340. Env restoration assertion passed. No opener/code-target temp roots, fake opener, launcher-owner, or broken-opener processes remain. Serialized CanvasPane/Shell/application/package/browser/docs/TASK-137 integration remains paused.

Serialized reconciliation released after TASK-134 integration.

Rebased fixed base: 569a384eabbcef8c57b5eb199420caed90bae794 (TASK-134 review-clean and integrated).
Accepted checkpoint mapping:
- 0566040a5597d4c357b6f5b86d835f4e6f9b7684 -> 628b1defbd38a408fce9653797bea4199af963ae
- 946cfdbc3d7d029b0d716e3f8f4ac63bb2f66828 -> e88c4a5baf31fc1b69ecde9c5bc8df068b905f16
- 201db0fa098bcde0c8bc1eac49bf8253e1a30e59 was empty against the new base and dropped
- 890547e8050bd3bc661d761c94568a27e5c8d953 -> 80cfb33c3d5e42c109d8910f94a15dabfdfc66dd
- 4137227db92c86d63eaccf35b4d6694524696c08 -> 775c35741c3b719d087603381bb0f5a25fd92bcf
- 203d9e130fe41ecd8c1c500c4c181f4eb30db1a8 -> faccb2381c82a0d395fd1b518d8d42b48a3fd0d9
- 1b3fed98f22fd11176791a066c08797b2afd8ec3 -> ac4c34f33455b4fa4ff7babe08681267ca15ed33
- cbe028cb333a74dcff20024c7dd48c6e11259ff9 -> 18e6f0a37dda40ae110b290560517b94179037d4
- 6697803f93d355bd1f348c9c124bade5fd6db736 -> a0252a34d651626548d6c1b46f8959bda32ca0a8

The replay completed without conflicts. Remaining serialized application/UI/package/browser/docs integration may now proceed while preserving TASK-134 vendor-derived RuntimeBoardElement/PersistedBoardElement, canonical presentation overlay, CanvasPane/Shell contracts, and strict ingress.

Serialized reconciliation implementation (fixed base 569a384eabbcef8c57b5eb199420caed90bae794):

- Mounted createCodeOpenerRouter after CORS and before global JSON parsing, with the exact activation-only NOT_A_BOARD_WRITE exemption. Guard-first router behavior, strict shared Zod replies, canonical note and registry re-read, machine state, resolver containment, and shell-free launcher semantics remain intact.
- Integrated the exact reserved-link CanvasPane handler and typed CanvasPane-to-Shell CodeTargetNotice boundary. Shell now owns schema-controlled success/failure notices, settings actions, and validated GitHub actions. Ordinary or non-exact links remain untouched. TASK-136 does not create reserved presentation URLs or implement real binding clicks.
- Added the global opener settings UI with fresh GET on each open, effective command and availability, platform/preset/custom choices, ordered argv validation, registered checkout testing, save, reset, and explicit next-activation machine-wide copy.
- Registered tests/system/code-targets once after process-contracts and opener-settings once after claim-interaction; updated the 14-owner adapter, once-only inventory mutations, docs, and environment isolation.
- TASK-134 reconciliation reused final vendor-derived ingress and canonical presentation contracts. Two strict-ingress fixtures were moved through a code-target-owned support seam that executes production completion; no handwritten vendor projection, persisted derived target, second converter, or TASK-134 type/presentation owner was added.

TDD and integration evidence:
- Initial reds proved the missing production mount/exemption and missing UI handler; the focused owners then passed. The TASK-134 strict-ingress integration red rejected partial handwritten note elements and was repaired through canonical production ingress.
- Final check first rejected two forbidden imports from another module private test support. The imports were relocated without weakening lint. Formatting then exposed a one-line-only exemption assertion; its exact regex/reason proof is now formatter-stable. The deliberately interrupted doomed run produced teardown-only WebSocket noise and was not counted as a product flake.
- Focused contracts: shared/runtime/server/UI 68 tests and 115 expectations; code-target system 34 and 175; inventory 30 and 74; boundary/refusal/registry 13 and 134; repaired integration owners 19 and 104; exemption owner 3 and 46.
- Final lanes: modules 373 tests and 2,727 expectations; system 247 and 3,988; repository 61 and 218; all 14 serial browser owners passed sequentially with 644 expectations, including opener-settings 34. Focused opener browser, standalone serial browser, bun run test, and final bun run check all passed. Type-check, build, lint, fmt:check, and git diff --check passed.

Caps and cleanup:
- Shared contract 220/220; timing 499/499; routes 286/360; settings UI 371/380 and CSS 230/230; browser owner 368/460; settings 275/480; activation 369/480; lifecycle 78/400; persistence 118/340; inventory 490/490. application +6, session +5, and Shell +57 stay within diff caps.
- Once-only selector and reference audits passed. No changed TASK-134 board-element, presentation, expansion, or ingress owner exists. No fake opener, launcher owner, opener process, canvas server, capture/release residue, or task-owned temporary root remains. One unrelated pre-existing /tmp/archboard-browser-7ds9lJ root is dated 2026-08-26 and was left untouched.

TASK-137 handoff remains unchanged: consume the exact shared builder/parser/Zod schemas, canonical runtime resolver, board/element-only protected POST, and typed CanvasPane notice boundary. TASK-137 alone replaces eligible file:// presentation, produces validated GitHub actions, and proves real file/directory binding clicks, ordinary-link coexistence, and changed-setting behavior in two browser panes. It must not accept client paths, duplicate containment/identity policy, cache opener state, or broaden the reserved URL shape.

Review checkpoint before this Backlog evidence commit: af07fe23b8a174e2d644ffd0dbe130feb2301953. Implementation remains In Progress for independent complete-range review; acceptance criteria and finalSummary remain untouched.

Complete-range review remediation (fixed base 569a384eabbcef8c57b5eb199420caed90bae794; implementation commit 79c676a):
- Split the code-opener route into an early CSRF and owned-body preguard plus response handlers mounted after the sole deny-by-default write boundary. The exact POST /api/code-targets/open request now crosses the boundary through only its documented NOT_A_BOARD_WRITE exemption. The global parser bypass is exact to owned opener body routes; Host, Sec-Fetch-Site, and Origin refusal remains before parsing, state, note, and spawn. Malformed and oversized owned JSON still returns shared-schema REQUEST_INVALID HTTP 400.
- Activation clients parse 2xx bodies only as CodeTargetOpenSuccess. A schema-valid failure body sent with HTTP 200 becomes RESPONSE_INVALID and cannot enter the normal server-failure callback path; non-2xx bodies retain CodeTargetOpenFailure parsing.
- Added one shared browser-safe absolute-or-bare executable validator and reused it in production planning and rendered settings validation. A custom ./editor draft renders inline invalidity and disables both Test and Save while server-side semantic refusal remains unchanged.
- Documented the exact CSRF limitation beside checkBrowserCsrf and added a named executable case: forged but valid loopback browser headers are accepted because this is browser CSRF protection, not authentication against a local header-forging process.

TDD evidence:
- Boundary red: the static owner could not find the split preguard, and the old response router sorted before the write boundary. A deliberate mutation deleting only the activation exemption made the public production-app request cross the boundary and fail with the board-write refusal before the opener handler; the mutation was restored.
- Reply red: HTTP 200 with success:false invoked the normal failure path instead of RESPONSE_INVALID.
- Executable reds: the shared contract initially lacked the semantic validator; after wiring inline text, the rendered owner still caught enabled Test and Save controls until semantic validity gated both actions.
- CSRF limitation red: the explicit source-adjacent limitation assertion failed before the comment and named forged-loopback acceptance case were added.

Validation:
- Focused affected module, UI, server, boundary, and inventory owners: 91 pass, 235 expectations. Focused opener browser: 1 pass, 37 expectations. tests/system/code-targets: 34 pass, 175 expectations. Full test:system: 248 pass, 3995 expectations. Full test:repository: 61 pass, 218 expectations.
- Standalone all-14 serial browser lane passed sequentially with 647 expectations. bun run test passed type-check plus 376 module tests and 2738 expectations, 248 system tests and 3995 expectations, 61 repository tests and 218 expectations, and all 14 browser owners. bun run check independently passed lint, formatting across 428 files, type-check, the same four lanes, and all 14 serial browser owners. No product flake occurred.
- git diff --check passed. Caps: shared index 220/220, helper 9, routes 304/360, canvas API 445/460, settings dialog 371/380, link owner 208/260, boundary owner 147/500, browser owner 379/460, timing 499/499; legacy fixed-base application, session, and Shell projections remain within +18, +12, and +70.
- Final process audit found no fake opener, launcher owner, opener process, canvas server, or browser-lane process. No task-owned opener/code-target/browser temporary root remains. The unrelated pre-existing /tmp/archboard-browser-7ds9lJ dated 2026-08-26 remains untouched.

TASK-137 handoff is unchanged: it alone replaces eligible file presentation URLs and owns real binding file/directory clicks, ordinary-link coexistence, GitHub action derivation, and two-pane activation. It consumes the exact shared schemas/parser/builder, canonical resolver, board/element-only POST, and typed notice boundary without broadening the URL, accepting client paths, duplicating policy, or caching opener state. TASK-136 remains In Progress for independent rereview; all seven acceptance criteria and finalSummary remain untouched.
<!-- SECTION:NOTES:END -->
