---
id: TASK-137
title: Bound code targets present unusable file URLs and omit GitHub fallback
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 15:35'
updated_date: '2026-08-29 14:29'
labels: []
dependencies:
  - TASK-136
references:
  - >-
    docs/adr/0018-code-targets-resolve-at-presentation-and-local-opening-is-a-server-capability.md
  - docs/adr/0011-bindings-name-a-repository.md
documentation:
  - CONTEXT.md
type: bug
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current outbound presentation emits browser-unusable file:// URLs for existing files, drops existing directory targets because it checks isFile(), and emits no target when a GitHub repository is unavailable locally. Bound elements must instead receive a working target derived at presentation time from their one portable binding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Every outbound browser and caller presentation recomputes the code target from the canonical binding and current checkout registry; no local-versus-remote classification, absolute path, internal target, or GitHub URL is persisted
- [ ] #2 When a matching registered checkout contains the bound real path, both files and directories receive an internal Archboard code target addressed by board and element identity
- [ ] #3 When the local target is unavailable and the repository identity is on github.com, presentation derives an HTTPS target for the bound path using the recorded commit when present, otherwise the recorded branch, otherwise HEAD; file and directory paths both open correctly
- [ ] #4 A registered checkout whose repository identity changed, a missing local path, or a symlink escaping the checkout is not presented as local; a missing local path falls back to GitHub when possible
- [ ] #5 Repository identities on other hosts receive no invented remote target, and unrelated human-authored Excalidraw links retain their stored value and browser behavior
- [ ] #6 Adding, moving, forgetting, or invalidating a checkout changes the next presented target without changing the board note
- [ ] #7 Regression checks fail on the current behavior and prove browser-visible local file and directory actions, GitHub fallback with no checkout, commit then branch then HEAD precedence, survival after a human edit, and absence of all derived targets in the raw note

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Fixed base and approval boundary

- BASE and current HEAD are ce6b1a2c0398fbfe021bd69863acb5c88826a9ff. TASK-136 is integrated and Done at this base. Implementation remains paused until this amended plan is approved.
- Keep all seven acceptance criteria unchecked and finalSummary null during planning. Do not change source, tests, package metadata, documentation, or generated files in the planning turn.

Change-acceptance gates

- Real unusable-link workflow: a person activates a bound code element from either live canvas pane. Today an existing file is exposed as a browser-unusable file:// URL, an existing directory has no link because the legacy overlay requires isFile(), and a GitHub binding without a valid local checkout has no link. The observable improvement is that the same rendered pointer action opens a validated local file or directory through Archboard's configured server-side opener, or opens the exact canonical GitHub fallback in a new tab, while the board note remains unchanged and portable.
- Reachable states only: handle a registered file, registered directory, absent/forgotten/moved checkout, changed checkout identity, missing target, realpath escape, github.com identity, non-GitHub identity, commit/branch/HEAD, ordinary bound and unbound human links, a browser echo, and a registry change between presentations. Do not design for browser-supplied filesystem paths, arbitrary remote providers, a historical target cache, or a broader reserved URL.
- Smallest resulting product: retain one portable CodeBinding, TASK-136's one canonical local resolver, TASK-136's exact board+element URL and protected POST, and TASK-136's typed notice boundary. Remove the bind-time machine URL and the duplicate presentation resolver. Add no persisted target, local/remote discriminator, cached opener or checkout state, client resolver, second containment rule, second route, or client-supplied path.
- Direct proof: module owners enforce canonical batch and URL/echo grammar; a public real-canvas HTTP/WebSocket owner proves presentation, freshness, off-screen export, and raw-note nonpersistence; one rendered owner proves real pointer activation, protected POST traffic, controlled opener launches, popup URLs, ordinary links, and two-pane settings freshness.

Protected contracts from TASK-134 and TASK-136

- Consume the exact exports from src/shared/code-target/index.ts: CodeBindingSchema, CodeTargetOpenRequestSchema, GitHubHttpsUrlSchema, CodeTargetNoticeActionSchema, buildInternalCodeTargetUrl, and parseInternalCodeTargetUrl. Do not shadow or widen those schemas, builders, or parsers.
- Keep resolveRegisteredCheckout(repository) and resolveLocalCodeTarget(binding) public signatures, result unions, call-time freshness, failure semantics, containment/identity authority, and activation behavior unchanged. Keep POST /api/code-targets/open protected, board-and-element-only, and resolved from the current canonical board binding. Do not accept a client path or href.
- Preserve TASK-134's board/element union, strict ingress, canonical converter, binding metadata, tracking, explicit opaque presentation-target contract, and nonpersistence behavior.
- Preserve TASK-136's guard-first parser, sole board-write exemption, config read on every activation, launcher, settings route, CanvasPane handler, Shell typed notice rendering, and existing browser/settings owners. GitHub recovery is additional CodeTargetNoticeActionSchema data across the same boundary, not UI-side resolution.

Diagnosis held at the fixed base

- The production repro asks presentElement to present a real bound file and expects /api/code-targets/open?board=system%2Farchboard&element=box-1. It fails because presentation returns file:///home/msc/.codex/worktrees/task-137/src/runtime/engine/presentation.ts.
- A second production probe observes file:// for a file, null for an existing directory, null for a GitHub binding without a checkout, and a bind-time file:// value from promotion.
- The cause is src/runtime/engine/presentation.ts: it separately calls checkoutFor, uses a second path containment spelling, filters with isFile(), and calls pathToFileURL. It lacks board identity, does not use resolveLocalCodeTarget or buildInternalCodeTargetUrl, and has no GitHub fallback. src/runtime/engine/promote.ts separately emits the same stale machine value.
- A further outbound audit found the off-screen export_findings_request in src/server/canvas/lib/application.ts sends snapshot.renderScene.elements directly instead of passing through presentation. DESIGN.md also still describes a local file:// overlay as current behavior. Both are in TASK-137 scope rather than deferred.

TDD implementation plan

1. Add request-local batch resolution inside the canonical src/runtime/code-target module before changing presentation.

- Retain resolveRegisteredCheckout(repository) and resolveLocalCodeTarget(binding) at the module root with their exact current signatures, result unions, call-time registry reads, failure codes/messages, containment checks, and identity semantics. The protected activation route continues to call resolveLocalCodeTarget unchanged.
- Add the product entry resolveLocalCodeTargets(bindings: readonly CodeBinding[]): LocalCodeTargetResult[]. It returns exactly one result for every input, at the same index and in the same order, including schema, checkout, containment, and target failures. It never drops, groups, sorts, or deduplicates result rows. Presentation zips the ordered results back to the ordered elements.
- One batch reads the current registry once and owns a call-local Map keyed by repository identity. It validates each distinct registered checkout once in that call: canonical root realpath/stat, Git-root equality, and repository identity. It then validates every binding target independently, including duplicate inputs: CodeBindingSchema, absolute/lexical escape rejection, target realpath, target stat, realpath containment, and file-or-directory kind. A repeated binding may reuse only its validated checkout result; it still realpath/stats its target.
- The Map dies when the batch returns. A later presentElements call re-reads the registry and revalidates every distinct checkout. Add no module-scope, kept(), opener, checkout, or derived-target cache.
- Put the private implementation under src/runtime/code-target/lib/resolver-core.ts. Do not create a root file named internal and do not expose a lib path as an interface. Both module-root files below delegate to this one core, so schema, registry, Git, containment, realpath, stat, ordering, and failure policy still have one implementation.
- Keep src/runtime/code-target/index.ts as the product root. It exports resolveRegisteredCheckout, resolveLocalCodeTarget, resolveLocalCodeTargets, their product result types, and the existing isPathWithin containment helper only. It exports no diagnostics function, diagnostics adapter, counter type, or test-only symbol.
- Add the separate module-root src/runtime/code-target/diagnostics.ts. It exports resolveLocalCodeTargetsForDiagnostics and its typed filesystem/registry/Git diagnostics adapter, delegates directly to lib/resolver-core.ts, and returns the same ordered result array. No production caller imports diagnostics.ts. No caller imports lib directly; index.ts and diagnostics.ts are the only roots allowed to reach the private core.
- First add src/runtime/code-target/tests/batch-resolution.test.ts through those two root files. Import product behavior from ../index.ts and counters from ../diagnostics.ts. Its counting diagnostics adapter supplies two repositories and duplicate target bindings. Assert the product batch returns one literal result per input in order. Separately assert diagnostics reports one registry read per batch, one root/Git identity validation per distinct repository, and one target realpath plus stat per input. Invoke a second diagnostics batch and assert all counts repeat, proving no retained cache. Never import src/runtime/code-target/lib or mock an Archboard module.
- Keep src/runtime/code-target/tests/resolution.test.ts as product-root parity proof. It must continue to prove resolveRegisteredCheckout and resolveLocalCodeTarget return the exact TASK-136 results. Retain isPathWithin as the product-root export and preserve the existing Windows cross-drive test through ../index.ts.

2. Add the one GitHub presentation grammar under src/runtime/code-target.

- Parse a remote-eligible repository identity only when it has exactly three nonempty slash-separated fields and the first field is exactly github.com: github.com/owner/repo. Reject missing, empty, trailing, or extra identity fields. Encode owner and repository as individual URL path fields.
- Choose the ref as binding.commit, otherwise binding.branch, otherwise the literal HEAD. Encode the complete ref with encodeURIComponent exactly once, so a slash inside a branch remains one ref field as %2F rather than becoming another path segment.
- Treat binding.path equal to '' or '.' as the repository root. Emit exactly https://github.com/<encoded-owner>/<encoded-repo>/tree/<encoded-ref> for that case. For any other path, reject POSIX absolute paths, Windows absolute paths or backslashes, empty interior segments, and every . or .. segment; never normalize an escape into acceptance. Encode each repository path segment separately and retain only the separators between segments.
- Validate the final string with GitHubHttpsUrlSchema. Add literal cases for a slash branch and a path containing spaces, #, %, and Unicode, plus root cases for '' and '.', commit-over-branch-over-HEAD precedence, exact identity negatives, absolute/escape negatives, and non-GitHub identity. The contract guarantees the exact validated URL that Archboard opens. GitHub's external /tree/ behavior for a file, including any redirect to /blob/, is a residual external dependency and is not an automated product guarantee.

3. Replace the engine's duplicate resolver with board-aware, batched presentation and an exact echo matrix.

- Add a narrow presentation result/helper in the canonical code-target module that consumes a canonical CodeBinding plus CodeTargetOpenRequest identity. Local success uses buildInternalCodeTargetUrl({ board, element }); local failure may use only the validated GitHub grammar from step 2. The local batch result is passed in by presentElements, so this helper never re-reads the registry.
- Use one compile-unambiguous context interface. presentElement(element, { boardKey, opaqueTarget? }) requires boardKey and uses a one-binding batch. presentElements(elements, { boardKey }) requires boardKey, collects bound elements once, calls resolveLocalCodeTargets once, and zips the ordered results onto copies. Preserve TASK-134's explicit opaqueTarget as the exact supplied overlay value.
- Require the same context shape on stripBindingPresentationLink, stripBindingPresentationLinks, and canonicalLinkAfterPresentationEcho. The echo helper derives element identity from the canonical element and receives { boardKey, opaqueTarget? }; no overload, positional string, default, or optional context may keep a board-blind spelling alive. bun run type-check must reject every old presentElement(element), presentElements(elements), strip helper, and echo-helper call until its caller supplies a board key.
- Remove checkoutFor, the duplicate inside/existingFile checks, and legacy file emission from src/runtime/engine/presentation.ts. When no derived code target exists, leave the canonical human link unchanged. Never persist or classify the computed internal/GitHub target.
- Define and test the echo/strip matrix exactly:
  - Internal: recognize only a value accepted by parseInternalCodeTargetUrl whose board and element both exactly equal the current canonical context.
  - GitHub: recognize only the exact fallback recomputed from the canonical binding by the grammar in step 2, independent of registry contents.
  - Opaque: recognize only the exact opaque value supplied through TASK-134's existing contract.
  - Legacy file: recognize only the exact pathToFileURL(local.target).href recomputed after a currently successful resolveLocalCodeTarget of the canonical binding.
- Restore the existing canonical human link or null only for those four exact matches. Preserve wrong internal board or element identities, wrong GitHub host/repository/ref/path, a different opaque value, a different file URL, and unrelated bound or unbound HTTPS/file links byte-for-byte as human-authored values. Do not treat every link on a bound element as derived.
- Record the unavoidable live-pane legacy limitation in DESIGN.md: if a pane still echoes an old file:// presentation after its checkout disappears, Archboard cannot prove that value was an old overlay without retaining historical presentation state. It therefore preserves that value as a human link. New presentations never emit file://. This narrow upgrade edge is preferable to a cache or deletion of a real human-authored file link.
- Extend src/runtime/engine/tests/presentation-links.test.ts with the complete positive and negative matrix. Include registry-independent GitHub recognition and the successful-current-resolution requirement for legacy file. Wrong identities, ref/path variants, and unrelated bound/unbound HTTPS/file links are mandatory cases.

4. Plumb board identity through every outbound and persistence boundary, including the off-screen export.

- In src/runtime/engine/board-write.ts pass target.key through pane deltas, canonical corrections, human and agent write answers, full documents, and before/after presentation comparisons.
- In src/server/canvas/lib/application.ts pass the resolved board key through initial scenes, board switches, element/list/search/get responses, selections, pane reports, exports, snapshots, refusals, and human-change echo recognition. Mandatory context objects are the static enforcement against board-blind production calls.
- Replace the human change-report code that currently loops over input.upserts and calls presentElement(existing) once per element. Collect the existing canonical elements in input order, call presentElements(existing, { boardKey: source.key }) exactly once for the request, then build presentationLinks by zipping ids to that ordered presented array. This gives the request one registry read and one checkout validation per distinct repository instead of one resolver call per upsert.
- Change export_findings_request so its raw WebSocket payload contains presentElements(snapshot.renderScene.elements, { boardKey: key }), not snapshot.renderScene.elements. Keep files and findings unchanged. This is an off-screen browser payload and must obey the same presentation contract as a visible pane.
- In src/runtime/engine/board-io.ts supply the canonical board key to final strip passes. Strip only values accepted by the exact matrix; the note remains the canonical document.
- Audit every presentElement/presentElements caller and every outbound element-bearing HTTP/WebSocket message once. Do not introduce a second outbound converter.

5. Delete bind-time and caller-visible machine URLs.

- Remove ResolvedBinding.link, PlannedNode.link, pathToFileURL construction, and the CLI promotion node link schema from src/runtime/engine/promote.ts and src/cli/commands/promote.ts. Keep repository observation, logical-address resolution, summaries, and persistence unchanged.
- Update tests/system/cli/repository-resolution.test.ts to prove resolveBinding returns only the portable address. Update tests/system/cli/repository-session.test.ts so public board/element reads expect exact internal board+element targets while promotion output and raw note bytes contain no checkout path or derived link.
- Update DESIGN.md's stale current file:// description to the board/element internal target, validated GitHub fallback, presentation-only overlay, and the explicit legacy live-pane limitation from step 3. Do not describe /tree/ file redirect as guaranteed.

6. Add GitHub recovery actions without changing activation authority.

- In src/server/code-opener/lib/routes.ts retain exact CodeTargetOpenRequestSchema parsing, canonicalBinding lookup, resolveLocalCodeTarget, and server-side opener launch as the only protected activation path.
- When the canonical binding has an exact validated GitHub fallback and local resolution or opener launch fails, add a { kind: github } action beside any existing settings action. Produce it through GitHubHttpsUrlSchema and return it through the existing CodeTargetNoticeActionSchema/CodeTargetOpenReplySchema and CanvasPane-to-Shell typed notice boundary.
- GitHub recovery is computed from the canonical board binding, never a client href. Do not add query input, body path, GET route, write exemption, UI resolver, retained opener state, or alternate canonical resolver.

7. Add exact public/system proof in tests/system/code-targets/presentation-contract.test.ts.

- Drive a real isolated canvas, real notes, real registry changes, HTTP reads, pane WebSocket messages, and the protected POST. Prove exact internal board+element URLs for a registered file and directory; exact GitHub URLs for commit, branch with slash, HEAD, root paths, and a path containing spaces/#/%/Unicode; no invented target for another host; and exact typed GitHub recovery actions.
- Prove registry freshness without a note write: no checkout gives GitHub, add gives internal, move or forget gives GitHub, creating a previously missing target changes the next presentation, changed origin invalidates local, and a realpath escape never presents local. Each presentElements call is a new batch.
- Exercise the complete echo matrix through a real human change report. Prove exact internal and GitHub echoes restore the stored human link/null, opaque does so only when explicitly supplied, legacy file does so only while canonical local resolution succeeds, and all wrong or unrelated bound/unbound HTTPS/file values persist unchanged.
- Attach a raw pane/WebSocket observer, trigger the public findings export endpoint, capture export_findings_request, and assert its elements carry the same current presentation overlay. Read the note before and after and assert exact bytes and bigint mtime are unchanged.
- Seed unrelated human links on bound and unbound elements, including a literal HTTPS link and a literal file:// link, and assert both remain byte-for-byte in the note and subsequent public presentation. Separately enumerate the exact derived candidates for this fixture and assert those exact strings are absent from raw note JSON: every expected reserved board+element URL, the exact canonical GitHub fallback, and the exact legacy file URL for the locally bound target. Also assert the exact checkout root, opener executable, and argv fixture values are absent. Do not make a categorical no-HTTPS or no-file:// assertion because those are valid human links.
- Keep existing tests/system/browser/finding-export.test.ts as rendered export regression coverage. TASK-137's system owner proves the off-screen raw payload so the existing browser owner does not become a second TASK-137 browser owner.

8. Add one rendered owner, tests/system/browser/code-target-activation.test.ts, as the fifteenth and final serial-browser owner.

- Use the existing lane-owned browser and a controlled immediate-exit fake opener. Own isolated canvas, vault, registry, config, home, temporary root, browser namespace, capture files, and sockets. Render two different boards in two panes.
- Activate Excalidraw's visible link affordance with a real agent-browser pointer/mouse action. Do not call HTMLElement.click(), dispatch a synthetic event, invoke the handler directly, or POST from the test.
- Install only a browser-side request log around the real fetch boundary. For every local activation, assert the pointer action produced exactly one POST to /api/code-targets/open with the exact { board, element } body and no path, href, repository, or extra field. Then assert the fake opener received the canonical real file or directory target and the canvas remained mounted.
- Activate a registered file in one pane and directory in the other. Change machine-wide opener argv through the rendered settings UI. Without reload or remount, make the next real pointer activation in each already-mounted pane and prove both use the new argv.
- Drag a bound element, wait for its real human change report, activate again, and prove the raw note keeps only the portable binding and canonical human link.
- For no-checkout GitHub file and directory bindings, use real pointer activation, enumerate the newly opened tab, inspect its exact pre-navigation URL, close it, and refocus the canvas tab before the next activation. Do not wait on or assert GitHub's external redirect. Repeat the inspect/close/refocus sequence for a separate ordinary human-authored link and prove it opens normally with no protected POST or opener capture.
- Cleanup is part of the owner: the fake opener exits immediately; poll capture completion and process death; close every popup tab; refocus and close the lane browser; dispose the canvas; remove only task-owned registry/config/vault/root/capture/release/socket resources. The adapter must audit process groups, listeners, sockets, temporary roots, and source hashes. Run only in the typed serial lane, with no direct parallel owner command and no overlap with another browser owner.

9. Register and reconcile the browser lane exactly once.

- Append tests/system/browser/code-target-activation.test.ts once to BROWSER_TEST_PATHS and package.json in canonical order. Do not create a second package lane, wrapper, or direct browser command.
- Update the existing once-only inventory assertions and actionable failure text. Keep tests/system/repository-policy/test-inventory.test.ts at or below 500 lines.
- Update docs/agents/test-suite.md's literal command, canonical order, and owner totals to 15. Correct AGENTS.md's stale count from 13 to the same final actual list of 15. This documentation reconciliation is part of TASK-137, not a separate task.

Exact owners and line budgets

- Canonical resolver: product root src/runtime/code-target/index.ts and private src/runtime/code-target/lib/resolver-core.ts each stay at or below 220 lines; test-only root src/runtime/code-target/diagnostics.ts stays at or below 100. index.ts exports product resolver entries, result types, and isPathWithin only. batch-resolution.test.ts stays at or below 280 lines, imports product behavior from ../index.ts and counters from ../diagnostics.ts, and never imports lib. resolution.test.ts remains the product-root single-target and Windows cross-drive parity owner.
- URL and presentation grammar: one new src/runtime/code-target/presentation.ts at or below 180 lines and presentation.test.ts at or below 320 lines. src/runtime/engine/presentation.ts remains at or below 190 lines; presentation-links.test.ts at or below 300.
- Public proof: tests/system/code-targets/presentation-contract.test.ts at or below 480 lines; if unavoidable, one task-owned support file at or below 300. Existing affected CLI/system owners remain at or below their current repository caps.
- Legacy plumbing: board-write.ts remains below 500 lines; board-io.ts gains no more than 12 lines; application.ts gains no more than 55 net lines and no second converter; routes.ts remains at or below 360. promote.ts and CLI promote shrink.
- Rendered proof: code-target-activation.test.ts at or below 480 lines; browser adapter support at or below 410; repository inventory owner at or below 500. The final browser owner count is exactly 15.

Natural reds, mutations, and validation

- Natural module reds: batch entry and GitHub grammar do not exist; file presentation is file://; directory/GitHub targets are absent; board context and exact echo cases fail.
- Natural public reds: HTTP/WebSocket values expose file:// or null, export_findings_request carries raw elements, promotion output includes a checkout path, recovery lacks GitHub action, and registry-transition echoes use the wrong current comparison.
- Natural rendered reds: pointer activation does not reach the protected POST for current file links; directories and no-checkout GitHub bindings lack usable affordances; there is no logged board+element POST, controlled directory capture, or popup URL.
- Required deliberate mutations after green:
  - remove the request-local repository Map: the distinct-checkout count fails;
  - retain the Map across two batches: the second-call counts and module-scope policy fail;
  - skip per-element target realpath/stat for a duplicate binding: the target dependency counts fail;
  - reorder batch results or omit a failure row: ordered product result literals and length fail;
  - export diagnostics from index.ts, import diagnostics.ts from production, or import lib outside the two module roots: the repository import-policy audit fails;
  - remove the isPathWithin product export or weaken cross-drive containment: the existing Windows test fails;
  - restore the application change-report's per-upsert presentElement loop: diagnostics-backed request counts fail and the once-per-request code audit fails;
  - omit a required board context or restore a board-blind overload/default: bun run type-check or the compile-contract owner fails;
  - split a slash branch into URL path segments: the literal %2F case fails;
  - accept an extra repository identity segment, an absolute path, or a . or .. path segment: grammar negatives fail;
  - broaden any echo arm by board/element, host/repository/ref/path, opaque value, or file URL: the negative echo matrix fails;
  - remove presentation from export_findings_request: the raw WebSocket assertion fails;
  - bypass pointer activation, omit POST logging, or omit popup close/refocus: rendered assertions or cleanup fail;
  - remove or duplicate the new browser owner: once-only inventory fails.
- Focused module gate:
  bun test src/shared/code-target/tests/contract.test.ts src/runtime/code-target/tests/resolution.test.ts src/runtime/code-target/tests/batch-resolution.test.ts src/runtime/code-target/tests/presentation.test.ts src/runtime/engine/tests/presentation-links.test.ts src/ui/code-target/tests/link-handler.test.ts
- Focused serialized public gate:
  bun test --isolate --max-concurrency=1 tests/system/cli/repository-resolution.test.ts tests/system/cli/repository-session.test.ts tests/system/code-targets
- Export/browser gates:
  bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/finding-export.test.ts tests/system/browser/opener-settings.test.ts tests/system/browser/code-target-activation.test.ts
  Then run the complete 15-owner serial lane.
- Repository and structural gates:
  bun test tests/system/repository-policy/test-inventory.test.ts tests/system/repository-policy/module-scope-policy.test.ts
  bun run type-check
  bun run lint
  bun run fmt:check
  git diff --check
- Final gate: bun run check. Read back exact public HTTP values, raw WebSocket payloads, controlled opener captures, logged POST method/path/body, inspected popup URLs, raw note bytes/mtime, owner inventory, and documentation counts. Run rg and repository-policy audits proving every outbound element-bearing path supplies a required board context object, the application change-report path makes one plural presentation call rather than a per-upsert presentElement loop, export_findings_request uses presented elements, and DESIGN.md no longer recommends file:// except the explicit legacy limitation. Enforce that index.ts exports no diagnostic symbol, no production source imports diagnostics.ts, no product caller imports src/runtime/code-target/lib, only index.ts and diagnostics.ts reach lib/resolver-core.ts, and tests import lib nowhere. Also prove no client path or widened reserved URL exists and no retained resolver/opener state was introduced.
- Before handoff, audit that no browser popup, process group, canvas listener, fake opener, capture/release file, registry, config, vault, task root, socket, source mutation, or owner overlap remains. Keep acceptance criteria unchecked and finalSummary null until implementation, direct verification, and independent review are complete.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation evidence (2026-08-29)

- Added one request-local canonical batch resolver behind product and diagnostics roots. Each batch reads the registry once, validates each distinct checkout once, validates every target independently in input order, and retains no cache.
- Replaced bind-time/file:// presentation with board+element internal targets for valid local files/directories and exact validated github.com fallbacks (commit, then branch, then HEAD). Added exact echo stripping for matching internal, GitHub, opaque, and currently resolvable legacy file overlays while preserving human links and negative near-misses.
- Plumbed required board identity through all outbound/persistence paths, batched human-change presentation once per request, and presented off-screen findings exports. Promotion results and persisted bindings no longer carry machine links.
- Added canonical GitHub recovery actions to the existing protected opener failure boundary without changing its board+element request, resolver, route, or launcher authority.
- Added public real-canvas HTTP/WebSocket coverage and one serial headless browser owner. The rendered owner uses real pointer activation in two panes, logs exact protected POSTs, captures real file/directory opener targets, changes argv through the settings dialog without remount, inspects and closes exact GitHub/human popup tabs, persists real drags, and proves raw notes contain neither derived targets nor opener/checkout state.
- Reconciled the browser lane and docs at exactly 15 owners; added repository import-boundary enforcement and updated canonical CLI contract proof hashes for the deliberately removed result link.

TDD and mutation evidence

Natural reds covered the missing batch/grammar modules, file:// and absent directory/GitHub presentation, missing board-aware echo behavior, bind-time link output, absent GitHub recovery, absent rendered link activation, and unpresented off-screen findings export.

After green, deliberate reverted mutations proved: distinct-checkout Map counts; per-input duplicate target realpath/stat counts; stable ordered one-result-per-input rows (fixture strengthened with a distinct directory row); no retained cross-batch cache; exact %2F ref encoding; exact board identity in internal echoes; findings-export presentation; diagnostics/core import boundaries; and once-only browser-owner inventory.

Validation evidence

- Focused module gate: 66 pass.
- Focused serialized public/system gate: 42 pass.
- Repository structural gates: 39 pass.
- Focused rendered owners and complete 15-owner serial lane: green; performance owner retained the 10,000-element report/hold budget.
- bun run test: green (396 module, 250 system, 62 repository, 15 serial-browser owners).
- bun run check: green, including lint, format, both type checks, and the complete test chain.
- git diff --check: green.
- One initial full run exposed an expected command-proof hash change and a transient hot-reload child-reaping assertion. The authored hashes were updated to regenerated canonical bytes; the hot-reload owner passed alone and in both subsequent complete test/check runs with no product change.
- Caps: index 35/220, resolver core 154/220, diagnostics 23/100, grammar 48/180, engine presentation 134/190, batch test 78/280, grammar test 37/320, presentation-links 124/300, public owner 213/480, rendered owner 438/480, browser support 384/410, inventory 490/500, board-write 464/500, routes 312/360, application net +28/+55.
- Lane cleanup audits pass. No task-owned browser, popup, canvas, fake opener, capture, release, registry, config, vault, socket, or generated proof artifact remains.

Review state intentionally unchanged: TASK-137 remains In Progress, all acceptance criteria unchecked, and finalSummary null pending independent complete-range review.
<!-- SECTION:NOTES:END -->
