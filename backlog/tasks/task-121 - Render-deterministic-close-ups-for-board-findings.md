---
id: TASK-121
title: Render deterministic close-ups for board findings
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 17:19'
updated_date: '2026-08-27 13:56'
labels:
  - ready-for-agent
dependencies:
  - TASK-119
references:
  - frontend/src/canvas/useCanvasSession.ts
  - src/cli/commands/scene.ts
  - src/types.ts
  - scripts/check-fixed-point.mjs
  - docs/agents/test-suite.md
  - package.json
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
  - tasks/task-071
  - tasks/task-097
  - 'https://bun.sh/reference/bun/Image'
  - tasks/task-123.01
  - tasks/task-123.03
priority: medium
type: enhancement
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render deterministic PNG close-ups for board-inspection findings without changing plain check or the existing full-board screenshot/export path.

Add one standalone CommandContract: archboard render-findings --board <key> --out <existing-empty-directory>, with the four already released inspection policy options. TASK-119 already owns each finding focusBBox, so focused rendering takes no arbitrary IDs, boxes, closure rules, padding, scale, background, format, or pixel-budget inputs.

The server reads the explicitly named persisted board once through a shared raw inspection/render snapshot owner, runs inspection against those bytes, and admits the same snapshot for rendering only when normal strict ingest can represent it without repair. It sends one immutable out-of-band payload containing the full presented scene/files and ordered finding focus boxes to one connected browser. The browser uses pinned Excalidraw export with a synthetic non-persisted frame for each box and never changes pane identity, elements, files, viewport, zoom, selection, or visible app state.

Raster behavior is fixed schema-v1: PNG, opaque white, up to 4x scale with the longest edge capped at 1024 px. The CLI validates PNG headers/dimensions and hashes, emits one ordered entry per finding, and writes validated images atomically into an existing empty directory followed by manifest.json last. Partial browser/export failure remains truthful through failed entries and complete:false.

This task does not add a generic RenderRegion or visual-closure system, a second bounds engine, Bun.Image processing, a Bun runtime bump, persistent render sessions, UI/MCP behavior, renderer parity, bridge logic, skill/reference documentation, or changes to plain check and full-board screenshot behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A standalone CommandContract-backed archboard render-findings command requires explicit --board and --out, supports only the four released inspection policy options, declares server/browser/local-read/read/local-write effects and one POST relationship, and leaves plain check byte-compatible, browser-free, server-free, and zero-HTTP.
- [ ] #2 One authoritative Zod result/manifest schema returns schemaVersion 1, board, source fingerprint, the exact InspectionReportSchema report, complete, and exactly one ordered rendered-or-failed entry per finding. Cross-field validation owns entry order/count, complete, digest/name derivation, dimensions, and hashes.
- [ ] #3 The server reads the explicitly named persisted bytes once, runs inspection and fingerprints that snapshot, and renders only a strict non-repaired projection of the same bytes. Malformed or duplicate identities and strict render-geometry refusal produce source-not-renderable entries rather than repaired or misleading images.
- [ ] #4 Each non-null TASK-119 focusBBox is the only crop request. Pinned Excalidraw receives the full immutable elements/files plus a synthetic non-persisted exporting frame for that exact box; Archboard adds no ID closure, bounds union, padding policy, or second geometry implementation.
- [ ] #5 Raster semantics are fixed to PNG, opaque #ffffff, scale min(4, 1024 divided by the longest focus-box edge), positive deterministic dimensions, and export padding 0. Output is independent of pane board, viewport, zoom, selection, focus, and recent activity, and browser rendering mutates no visible state.
- [ ] #6 Stable report order and collision-resistant names NNNN-FINDING_CODE-first12FindingDigest.png are enforced. PNG signature/IHDR/dimensions and SHA-256 are validated, every finding has one manifest entry, and null focus, unrenderable source, browser export failure, timeout, or invalid PNG is explicit and makes complete false.
- [ ] #7 All successful PNGs and the manifest are validated before writes. The output directory must already exist and be empty; each image is written atomically, manifest.json is committed last, and stdout follows commit. A mid-set filesystem failure emits no stdout or manifest and may leave only unclaimed atomically complete PNGs, without adding a generic rollback transaction.
- [ ] #8 Existing full-board PNG/SVG screenshot behavior, normal read/write/converter/lock/claim/version routes, server/UI session semantics, TASK-119 inspection, TASK-120 bridges, released skills, package engines, and generated ownership remain unchanged.
- [ ] #9 The current CommandContract audit grows from 35 commands, 25 subcommands, and 60 paths to 36 commands, 25 subcommands, and 61 paths. The immutable ordered fixed-57 compatibility subset remains byte-identical and the new path is introducedBy TASK-121.
- [ ] #10 Focused pure/module/package tests and one existing sequential headless browser lane prove exact check parity, off-screen explicit-board isolation, embedded files, z-order and clipping, deterministic repeated bytes across viewport changes, truthful partial manifests, atomic manifest-last behavior, and unchanged full-board screenshot behavior without a new browser suite or two-pane matrix.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a narrow shared finding-raster owner for fixed dimensions and a CLI finding-rendering deep module for the sole public Zod manifest schema, canonical finding digest/name, PNG IHDR validation, and ordered artifact assembly. Extract the four released inspection-option parser/metadata pieces once for check and render-findings without changing check behavior.

2. Refactor board-io private raw Drawing extraction so the existing inspection reader and a finding-render snapshot projection share one note read/parser. Return raw inspection elements, strict renderable content/files when admissible, and the note fingerprint; change no normal reader or writer.

3. Add POST /api/export/findings and a private browser result callback beside the existing image export. Use one transient kept pending-request map and the shared browser-export timeout owner. Send a full immutable scene/files payload with ordered finding indexes/focus boxes; accept correlated per-index results without visible scene or pane mutation.

4. Add the frontend message branch and a private Excalidraw synthetic-frame export helper. Use fixed PNG/white/4x-to-1024 semantics and post each result separately under the existing body limit. Do not modify /api/export/image or screenshot behavior.

5. Add the canvas-client wrapper, standalone CommandContract and registry entry. Extend the private PendingArtifact type only to support an ordered validated file set; preserve existing single-file behavior, use writeFileAtomic for every member, and commit manifest last into an existing empty directory.

6. Update only the canonical 61-path CLI audit, generated proof owner metadata, package test registration, and test-suite documentation. Do not edit skills, TASK-123.03 material, package engines, ADRs, or unrelated docs.

7. Validate pure dimension/name/schema/PNG/artifact rules, server/socket correlation and timeouts, package streams/exits and check parity, and one existing sequential browser scenario for off-screen board rendering and visible-pane immutability. Then run focused gates, two stable fix passes, complete bun run check, separate bun run test, and independent fixed-range Standards and Spec reviews from 93997c125521d5c8ffc42bf2223930167124d637.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoints complete through 626d561.

- dac7326 owns the fixed finding raster policy, closed manifest/result schema, PNG validation, shared inspection policy, and atomic ordered file-set commit with manifest last.
- 86c53f8 adds the one-read raw note snapshot, strict non-repaired render projection, kept correlated browser callback, and pinned synthetic-frame PNG export without pane adoption or scene/viewport mutation.
- 4873d71 registers standalone render-findings as current path 61 while keeping the immutable ordered 57-path subset unchanged; package evidence covers exact policy transport, exits 0/1/2/3/4, empty-directory precedence, relative output names, source-not-renderable, and zero stdout on artifact/response failure.
- 626d561 extends the existing sequential headless fixed-point lane with an off-screen embedded-image board, valid bridge plus unmarked crossing, repeated viewport-independent PNG/manifest bytes, visible-pane immutability, and unchanged full-board screenshot.

Focused green evidence before full validation: type-check, lint, boundaries, module-scope, 61-path contract gate, package CLI surface (36 commands/25 subcommands), server/socket board suite, and the extended fixed-point browser suite. TASK-121 remains In Progress with all acceptance criteria unchecked for independent review.

Fixed-range remediation from rejected head 4eb434a:

- Restored fixed-base blank tolerance coercion for dimension/intersection/overlap while retaining finite nonnegative validation.
- Made finding ordinals four digits minimum and proved 9,999/10,000 manifest totality with one entry per finding.
- Replaced note-only manifest identity with a deterministic render-snapshot fingerprint over the note hash and ID-sorted hydrated file id/mime/created/dataURL records; ADR-0017 external image byte changes now move the fingerprint without changing note bytes.
- Added exclusive atomic artifact publication: unexpected directory members are refused, expected-name races cannot replace existing bytes, PNGs remain before manifest and stdout remains after commit.
- Extended the existing fixed-point browser lane with exact report/fingerprint/order equality and decoded PNG samples proving focus clipping, embedded image contribution, and topmost z-order while preserving pane/viewport/full-screenshot and repeated-byte invariants.

Focused evidence green: test:inspection (836 checks), test:boards, command-contract and finding-rendering unit suites, lint, type-check, boundaries, module-scope, and test:browser. Full final validation remains pending.

Final validation green: two consecutive bun run fix passes produced identical diff bytes (895a47a0871aea4e387fdae9cc81dedde09dc81f2c9c4883a8ed4125575acd4d), deterministic on-demand contract generation matched across two owned temporary destinations, bun run check passed, and a separate complete bun run test passed. All browser lanes ran sequentially/headless through the repository chain. git diff --check and clean-tree confirmation follow in the final handoff. Generated views remain absent and ignored.

Independent-review closure from HEAD 1be771e:

- bea509d tracks the hard-link commit state. A transient manifest temp unlink retries and succeeds. A persistent cleanup failure removes manifest.json before rethrowing, while existing PNG partial-set, collision, no-replace, manifest-last, and stdout-last behavior stays intact.
- 046c3b1 computes the canonical hydrated-file contribution before strict render admission. An ADR-0017 attachment byte change now moves sourceFingerprint even when invalid geometry keeps renderScene null and produces source-not-renderable entries.

Focused owners green: command-contract public runner 27 tests and 161 expectations, lint, type-check, and the complete server/socket board suite including the unrenderable hydrated attachment case. Final repository validation remains pending.

Final remediation validation:
- Two consecutive `bun run fix` passes were byte-stable after committing the formatter-only projection layout; the distributable skill validator passed inside both commands.
- `bun run check` passed completely. `bun run test` then passed separately and completely. All four browser suites ran sequentially and headless in each chain without a retry.
- On-demand contract views generated twice into separate owned temporary directories with identical bytes; the three derived checkout views remain absent and ignored, while the canonical audit JSON remains tracked.
- Focused evidence remains green: 27 command-contract tests / 161 expectations, `test:boards`, type-check, lint, 836 inspection checks, 61 contract proofs, and the fixed-point focused-rendering pixel/immutability evidence.
- Final repository hygiene pending only the committed note, `git diff --check`, task-state confirmation, and clean-tree confirmation.

AC7 ownership remediation from HEAD dbc0ac8:
- a95d5cf removes destination unlink from post-link temp cleanup. writeFileAtomicExclusive retains the synced temp device/inode, retries only the temp unlink, and accepts persistent cleanup failure only when lstat proves the destination still names the committed inode. A missing or replaced destination fails with no stdout; a foreign replacement remains untouched.
- Public-runner evidence covers transient cleanup success, persistent cleanup with an identity-matching destination, destination disappearance, and foreign replacement. Existing EEXIST collision, unexpected-member refusal, mid-set partial PNG, manifest-last, and stdout-last cases remain green.
- Focused checkpoint: 29 command-contract tests / 172 expectations, type-check, lint, and git diff --check passed. Full validation remains pending.

AC7 ownership remediation final validation:
- Two consecutive `bun run fix` passes produced the same diff hash after the formatter-only checkpoint; the distributable skill validator passed inside both commands.
- On-demand contract generation matched byte-for-byte across two owned temporary destinations. The three derived checkout views remain absent and ignored; canonical audit JSON remains tracked.
- `bun run check` passed completely. A separate complete `bun run test` then passed. All four browser suites ran sequentially and headless in each chain without retry.
- Final focused totals remain 29 command-contract tests / 172 expectations in the direct owner and 37 contract/rendering tests / 199 expectations in the repository chain, plus 836 inspection checks, 61 contract proofs, and unchanged fixed-point focused-rendering evidence.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:22
---
Planning pass completed from current source inspection and Bun 1.4 API verification. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-26 00:03
---
Plan review incorporated the originating viewport-versus-full-scene failure, unified RenderRegion, out-of-band renderer, approved partial-failure retention, PNG-only focused output, and the CLI-only schema contract after TASK-124.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: focused rendering remains a CLI-only CommandContract and documents only its REST application relationship where relevant.
---

author: @codex
created: 2026-08-27 11:14
---
Parent orchestration started after TASK-120 shipped. Before implementation, run a current-source xhigh deletion-test plan review. Prefer the smallest deterministic close-up contract that solves finding evidence export; reject speculative renderer platforms, duplicated bounds engines, unnecessary server/session state, broad visual-closure taxonomies, or browser test matrices beyond the real product seam.
---

author: @codex
created: 2026-08-27 11:38
---
Parent approved the current-source xhigh deletion-test amendment. The standalone render-findings command, direct reuse of TASK-119 focusBBox, pinned Excalidraw synthetic-frame export, fixed raster semantics, manifest-last artifact set, 60-to-61 registry growth, and explicit deletion of RenderRegion, Bun.Image, runtime-bump, closure-taxonomy, check-mode, and two-pane machinery are the implementation contract.
---
<!-- COMMENTS:END -->
