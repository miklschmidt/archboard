---
id: TASK-171
title: Author and open a persisted semantic architecture board
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:13'
updated_date: '2026-09-11 20:20'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Establish the first usable path from agent-authored meaning to a readable live architecture pane. The shared integration branch may temporarily retain legacy callers while later tickets replace them; the delivered product has one semantic model.

## Blocked by

None (can start immediately).

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A command creates an empty or populated named board using canonical Zod validation and stable identities; a read-only pane renders architecture using the in-repository PR Lens fork with license and pinned provenance.
- [x] #2 One versioned JSON board aggregate persists all variant state; every board-state mutation uses one atomic fsync write boundary with board-global claims and expected-version checks, advances its version exactly once, and rejects invalid/stale writes without changing persisted state.
- [x] #3 The viewer supports pan/zoom, selection and explicit loading/empty/error states without authoring geometry; text is measured and renderer-owned.
- [x] #4 A minimal create/edit/read/restart/render workflow works through public interfaces with focused behavioral coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Researched seams (bfe9382e): atomic-write.ts writeFileAtomic (temp+fsync+rename) is the only durable
writer; board-lock.ts owns claims (claimBoard/claimOn/releaseClaim) and withBoardLock; board-write.ts
is the Excalidraw-specific write boundary and is NOT reusable for a JSON aggregate; ids.ts is the one
minting site (1-8 block-id chars); measure-text.ts/fonts.ts measure real font files with opentype
tables (font-file.ts reads woff2 only); shared/code-target exports CodeBindingSchema; module layout and
import directions are enforced by tools/oxlint-plugin-archboard (complexity 6, max-lines 600, JSDoc on
every function, @/ imports, no default exports). PR Lens 0993b4d renderer is ~4.8k lines; its
architecture path (design/geometry/bounds/theme/atlas/scope/layout/svg) is what this slice forks;
layout/dataflow + svg/dataflow stay upstream until TASK-173.

1. src/shared/semantic-board - canonical Zod contract, types inferred, no repo deps beyond
   shared/code-target. Board aggregate: schemaVersion, kind, id, name, version, createdAt, updatedAt,
   variants[] (id, name, lifecycle draft|current|historical, parent?, content), current variant id.
   Content: nodes (id, name, kind, responsibility?, description?, parent?, binding?) and edges
   (id, from, to, kind, label?, description?, emphasis). Integrity beyond Zod shape: unique ids,
   edge endpoints resolve, containment single-parent and acyclic, current names a real variant,
   variant ancestry acyclic. Views/flows/walkthrough/adoption deliberately deferred to their tickets.

2. src/domain/semantic-renderer - in-repository PR Lens fork (MIT notice + pinned revision recorded),
   rewritten to repository style. Architecture grammar only. Bands are derived from containment
   (a root node with children is a band; a root node without children is a headerless implicit band),
   so agents never author geometry. Replace PR Lens's estimated glyph table with measured text from
   the repository's real font files. Public entrypoint: renderSemanticArchitecture(content, options)
   -> { svg, width, height, atlas } with the atlas keyed by semantic node/edge id.

3. src/runtime/semantic-board - the one aggregate write boundary. readSemanticBoard(name) and
   writeSemanticBoard({board, expectedVersion, doing, writer, transition}): resolve board file, take
   the board-global claim, read once, run one pure transition, validate the candidate, advance version
   exactly once, persist through writeFileAtomic, publish. Stale version, missing claim, invalid
   candidate and failed persistence all leave the file byte-identical. Pure transitions
   (createBoard, editVariantContent) live in lib/ and never touch disk. Boards persist as
   <vault>/<name>.semantic.json; legacy .excalidraw.md notes are never read or written by this path.

4. src/cli/commands - semantic board create / edit / show / render, registered through the existing
   command contract, refusing with the same vocabulary as the legacy commands.

5. src/server - a read route for the aggregate and a render route returning SVG + atlas + version,
   so the browser never imports the renderer or reads the vault.

6. src/ui - a read-only semantic board pane: explicit loading, empty and error states, pan/zoom,
   and selection driven by the atlas. No authoring, no geometry, no writes from the viewer.

7. Verification: focused runtime tests for schema/integrity refusal, one-version-advance, stale and
   unclaimed refusal leaving bytes unchanged, restart recovery, and a deterministic render; a rendered
   viewer test for loading/empty/error, pan/zoom and selection; then bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Server, store, contract and CLI half landed (renderer and viewer in progress):

- src/shared/semantic-board: canonical Zod contract with inferred types. Board aggregate
  (schemaVersion/kind/id/name/version/createdAt/updatedAt/variants/current), variant
  (id/name/lifecycle/parent?/summary?/content), content (nodes, edges). Integrity beyond
  shape: supported contract major, unique variant ids and names, exactly one lifecycle
  'current' agreeing with board.current, acyclic single-parent containment and ancestry,
  resolvable edge endpoints, node/edge id namespaces disjoint. Input spellings
  (id optional, endpoints by id or name) are separate schemas spent at the write boundary.
- 'current' is reserved as the movable designation and refused as a variant's lasting
  name; resolveVariant() distinguishes asking for the designation from asking for a state.
  A board's first variant is named 'Initial'.
- src/runtime/semantic-board-store: one aggregate write boundary. Board-global lease
  (board-lock), claim identity and revocation, expected-version check under the lease,
  pure transition, candidate validation, exactly one version advance, one writeFileAtomic.
  Every refusal leaves the file byte-identical. Boards persist as <vault>/<name>.semantic.json;
  no Excalidraw note is read or written on this path.
- Batch semantics judged on the final candidate: a container and its contents can be
  removed or re-parented in one command in any order; an edge named for removal that its
  endpoint already removes is not an error; ambiguous name references are refused with the
  ids to use; genuinely new entities are minted through src/shared/ids against every id the
  board family holds.
- src/server/canvas/lib/semantic-board-routes.ts: GET /api/semantic-boards,
  /board, /render; POST /create, /edit. Excluded from the Excalidraw write boundary (it
  would install a note); --doing is enforced and announced here instead.
- src/cli/commands/semantic.ts: semantic | new | edit | show | render, registered in the
  audit and the generated contract artifacts.

Tests: 15 store contract tests, 11 shape-and-coherence tests, one end-to-end system owner
(tests/system/semantic-boards/workflow.test.ts) covering create/edit/read/restart/render,
undescribed-write refusal, stale-write refusal, and the absence of any .excalidraw.md.

Orchestrator independent foundation reviews found current-slice gaps in claim/release reachability, required version preconditions/refusal codes, ID minting/replacement validation, case/nested/symlink addressing, stored identity validation, malformed input/render replies, request cancellation, edge-label selection, delivered font metrics and stale-refresh disclosure. Findings provided to Claude for correction before acceptance. Parent isolated store create/stale/edit probe passed; schema integrity regression probe passed after fixes. Full interface/browser validation remains pending.

Foundation review (/tmp/archboard-semantic-foundation-review.md) findings and what each became:

1. Expected version optional on edits — now required, at the shared write boundary as well
   as at the transport and the command. A transition declares `changesExistingBoard`;
   `writeSemanticBoard` refuses one without a stated version, the route refuses before the
   boundary, and `semantic edit` refuses as a usage error naming `semantic show`. A present
   but unreadable, repeated or empty version query is refused rather than treated as absent.
   Create refuses a stated version outright: there is no prior version to have read.
2. Claim/release only found Excalidraw notes — `claimableKey` falls through to the semantic
   address when the note resolver finds nothing and a semantic board of that name exists, and
   a claimed semantic board reports its own aggregate version. Neither path reads or writes a note.
3. Caller-supplied unknown ids created new subjects — a stated node or edge id must now name
   something already on the selected variant; anything new is minted through src/shared/ids
   against every id the board family holds. A typo is refused with what to do instead.
4. Case-variant creates pre-resolved paths before the lease — the key is now computed from the
   name alone, the lease is taken on it, and the file is resolved under the lease. Two spellings
   of one name are one board and the second create is refused as BOARD_EXISTS.
5. Nested symlinks could escape the vault — addressing now checks containment against the real
   path of the deepest existing ancestor, not the lexical one, and refuses with the reason.
6. Nested names were half-supported — the address keeps its full relative form, directories are
   created under the lease after every check, and the listing walks the vault without following
   links. `services/payments` creates, lists, reads and renders.
7. A document's declared name was not checked against its address — a board whose name disagrees
   with the file it was found in is refused as BOARD_MISADDRESSED rather than answering to both.
8. Invalid HTTP bodies became empty commands — the envelope and the stated content are validated
   before anything is written; an absent create body is an empty board, an absent or non-object
   edit body is refused.
9. The stale code was VERSION_CONFLICT where the product publishes BOARD_VERSION_CONFLICT —
   unified, so a stale semantic edit exits 5 with the declared refusal rather than a generic 1.
10. Semantic writes made their own abort signal — they now go through `asyncEndpoint`, the
    canvas's own mutation admission, so a disconnected caller's queued work is cancelled and the
    shutdown drain counts the write.
11. Unclaimed agent writes shared the identity "agent", which the reentrant lease treated as one
    writer — the boundary now mints a fresh identity per unclaimed write and uses the claim's
    identity only when there is a claim. A caller cannot supply an agent identity at all.
12. The render reply admitted impossible states — it is one Zod union of a complete drawing or an
    explicit NOTHING_TO_RENDER, so a partial reply is a protocol error rather than an empty board.
13. Edge labels had no semantic identity — the pill is inside its edge's group and the edge's
    atlas box covers route and label.
14. The SVG named fonts it did not register — the renderer now owns four faces (Onest and DM Mono,
    already in this repository), registers them in the document, and measures each string in the
    same face and weight it is drawn in. `font-file.ts` reads plain sfnt as well as woff2 and
    `measure-text.ts` exposes `measureLineIn` for a caller-named stack, so there is still one
    measuring engine. The canvas serves the faces at /assets/diagram-fonts; an exported file
    embeds them.

Visual evidence: both sample renders opened in a real browser with the embedded faces
(architecture-light-embedded.svg, architecture-dark-embedded.svg; 11 nodes, 3 regions,
12 edges, 1658x542). Typography reads as intended — a card's name in Onest medium over its
responsibility in the regular face, band headers small, tracked and grey under a hairline,
edge labels in DM Mono pills, a kind glyph on every card. Both themes are balanced and no
text overflows its box. Two layout defects were found and recorded on TASK-172, which
reworks the band model for nested containment: the shared row grid leaves large empty
bands, and an edge that names a container lands its arrowhead on the band header's text.

Independent regression probes against the public store and lock APIs, in a disposable vault
and state directory, confirmed on the current source: an edit with no stated version is
refused EXPECT_VERSION_REQUIRED with the file byte-identical; a stated node id that names
nothing is refused UNKNOWN_NODE with the file byte-identical; services/payments creates and
lists under its full name; a board addressed through a symlink out of the vault is refused
and nothing is written outside; and two creates of Race and race queued behind a held lease
produce one applied write, one BOARD_EXISTS and one physical file.

Gate evidence, by lane, all run against the final source of this slice:

- bun run lint (baseline + type-aware policy over src, scripts, tools): exit 0.
- bun run fmt:check: all matched files correctly formatted (1910 files).
- bunx tsc --noEmit and bunx tsc --noEmit -p tsconfig.frontend.json: both clean.
- bun run build:frontend: succeeds.
- Module lane (bun test --isolate over src, capacity and tooling owners excluded as the
  package scripts exclude them): 1813 pass, 0 fail across 209 files, plus src/ui 984 pass,
  0 fail across 98 files.
- bun run test:repository: 8 pass, 0 fail.
- System lane, run per directory because one whole-lane invocation of mine was killed by
  its own wrapper and the pipeline's exit 0 was the grep's, not a pass:
    tests/system/boards             75 pass, 0 fail, 17 files
    tests/system/label-geometry      6 pass, 0 fail,  4 files
    tests/system/cli                71 pass, 0 fail, 12 files
    tests/system/board-inspection   18 pass, 0 fail,  7 files
    tests/system/canvas-state       26 pass, 0 fail, 15 files
    tests/system/semantic-boards    11 pass, 0 fail,  1 file
    tests/system/process-contracts  47 pass, 0 fail, 19 files
    tests/system/code-targets       63 pass, 0 fail,  5 files
  317 tests, 0 failures, with the same path-ignore exclusions the test:system script uses.

A note on the machine: an earlier command of mine timed out and left a bun test process
running at full CPU for an hour. It is what made concurrent browser owners flaky while it
lived. It was positively identified as mine before being killed; no user process was touched.

Live demo for independent inspection, running on its own everything:
  URL    http://127.0.0.1:3200/?paneA=semantic:pipeline
  vault  /tmp/claude-1001/-home-msc-Projects-archboard/da98f4d3-d8ac-49fe-8589-07bf568de5ef/scratchpad/demo/vault
         (one file: pipeline.semantic.json; no .excalidraw.md anywhere in it)
  state  the same demo directory, through its own HOME, XDG_CONFIG_HOME and XDG_STATE_HOME,
         so it holds none of the user's Codex roots and reads none of the user's boards
  log    .../scratchpad/demo/canvas.log

The board is this feature's own current pipeline, stated from the TASK-180 source brief:
sixteen nodes in three containers plus one uncontained datastore, eleven relationships,
authored through `archboard semantic new pipeline --doing "..." --input current-pipeline.json`.
Opened in the real shell it draws inside a real pane, with the header, navigator, pane bar and
workbench dock around it; clicking a card rings it in the selection colour. The pane bar still
names the hidden Excalidraw board underneath it ("scratch"), which is the temporary coexistence
seam the viewer documents and TASK-179/181 removes.

On the reported pointer-selection failure: it does not reproduce, and the instrumented
evidence says there is no retargeting to retarget. With a listener in capture phase on the
stage, a real pointer click on a card's text in the running demo records exactly three
events — pointerdown, pointerup and click — all three targeted at the <text> inside that
card's group, no gotpointercapture and no lostpointercapture, and the card ends up selected.
The same holds after 0, +, +, Right, which is the sequence the failure was reported against.

I reproduced zero selection once myself and then found the cause: this page's CSS viewport is
2414 x 1550 while a captured screenshot is 1372 x 881, so a click at "screenshot coordinates"
lands somewhere else entirely. Clicking the element itself rather than a coordinate selects
every time. A click that misses a card lands on the stage background, which clears the
selection — so a near miss looks exactly like "selection is broken", which is probably worth
making less ambiguous later, but the pointer path itself is sound.

Baseline for a failing browser owner that is NOT this branch's: tests/system/browser/
workspace-address.test.ts was run three times on the parent commit bfe9382e, in a clean
worktree with its own bun install and build:frontend, as
`bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/workspace-address.test.ts`.
It failed 3 runs of 3 there — 0/5, 3/5 and 2/5 passing, a different subset each time, each run
logging `Error opening board: No pane is open, so there is nowhere to put a board — "A-xxxxxx"
names nothing.` through a pollUntil on /api/panes that hits its 30s bound. On the branch tip the
same file fails the same way, so this is pre-existing nondeterminism in pane registration, not a
regression from the semantic-board work. It stays open and is not weakened or skipped; routing
changes again in TASK-179 and TASK-181, so it belongs to the final gate, where the public routing
workflow is re-run against the finished product. A second, smaller thing the control showed: the
owner's 30s pollUntil bound exceeds the suite's 20s per-test wall-clock budget, so every timeout
reports twice. Logs: scratchpad/control/run{1,2,3}.log.

The reported selection failure was real, and the earlier note saying it did not reproduce was
wrong. `SemanticDiagram` called `setPointerCapture` on the viewport on every `pointerdown`.
Pointer Events level 3 §4.2.12.3 then dispatches the click to the capturing element rather than
to what was under the pointer, and releasing capture in the pointerup handler does not undo it,
so `subjectAt(event.target)` resolved to the viewport and every real click picked nothing. The
browser owner missed it because it dispatched a synthetic `MouseEvent("click")` straight at the
card, which never goes near a pointer or a capture.

What the pick is, is now decided at `pointerdown`, where nothing has moved yet and nothing can be
retargeted, and it is spent on the click that follows. The viewport takes the pointer only once a
gesture has passed the drag tolerance, so a press is never captured at all and a pan still tracks
after the pointer leaves the pane. That tolerance is measured from where the gesture began rather
than from the previous move, so a slow drag of many one-pixel steps is a pan and not a click. A
gesture the browser takes away discards the pending pick.

Verified twice. Three rendered owners: a press on a card whose click arrives at the viewport
picks the card; a twenty-step one-pixel drag from a card pans and picks nothing; a cancelled
gesture picks nothing. The first is mutation-checked — restoring `subjectAt(event.target)` turns
it red and the fix turns it green. Then in the running application, against a freshly built
bundle: press on a card with the click retargeted to the viewport selects it, a one-pixel-step
drag from a card pans without selecting, and a press on the background clears. The browser owner
now dispatches the whole sequence with the click on the viewport, so it would fail on the old code.

The browser owner is mutation-checked too: with `subjectAt(event.target)` restored and the
frontend rebuilt, `bun tests/system/browser/run-browser-lane.ts --focus
tests/system/browser/semantic-board-viewer.test.ts` fails (0 pass, 1 fail); with the fix in place
and rebuilt it passes (1 pass, 0 fail). So the selection assertion in it is load-bearing rather
than a synthetic click talking to itself.

Closed after the pointer defect was found, fixed and verified independently. The rendered owner
for the viewer is now two files — the stage's states and camera in one, picking in the other,
over a shared harness — because picking is a gesture rather than a state and the single file had
outgrown the 600-line cap. Gate re-run after the fix: lint exit 0 over both configs, formatting
clean over 1912 files, both type-checks clean, 988 UI tests, 15 semantic-viewer tests, and the
semantic-board browser owner passing and mutation-checked.

The one browser owner still failing, tests/system/browser/workspace-address.test.ts, fails
identically on the parent commit and is recorded above as a pre-existing baseline, not a
regression. It belongs to the final gate, after TASK-179 and TASK-181 rework routing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An agent can now state an architecture and a person can open it.

The canonical contract is one Zod schema in src/shared/semantic-board: a board aggregate holding
its whole variant family, each variant's nodes and relationships, and the movable current
designation. `current` is reserved as that designation and refused as a variant's lasting name,
so a formerly current state stays identifiable. Beyond the shape it checks the rules a shape
cannot state: the supported contract major, unique variant ids and names, exactly one variant
marked current agreeing with the designation, acyclic single-parent containment and ancestry,
resolvable endpoints, and disjoint node and edge id namespaces. Nothing in it can carry a
coordinate.

src/runtime/semantic-board-store is the one place a board changes. Every command — create and
edit today, branch, resolve and adopt later — goes through it: the board-global lease with a
minted-per-write identity or the standing claim's, the expected-version check that a non-create
write must state, one pure transition, validation of the candidate including that it is the board
its address names, exactly one version advance, one writeFileAtomic. Every refusal leaves the file
byte-identical. Boards are <vault>/<name>.semantic.json; no Excalidraw note is read or written.

src/runtime/semantic-renderer is an in-repository fork of PR Lens's architecture grammar at
0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0, MIT notice and provenance in NOTICE.md, adapted so
bands come from containment, text is measured in the same face and weight it is drawn in, and
every subject carries its semantic id. The canvas serves the faces and the renderer registers
them, so what a browser draws is what the server measured.

The viewer is a read-only stage in the existing shell with four states — loading, empty, error,
and a stale picture with a disclosure and a retry — plus pan, zoom and atlas-driven selection.

Verified: 1813 + 984 module tests, 317 system tests across eight directories, the new end-to-end
owner covering create, edit, read, restart, render, claim, nested names and every refusal, the
new browser owner passing in the serial lane, lint, format, both type-checks and the frontend
build all clean, and both themes plus the real pane inspected in a browser.
<!-- SECTION:FINAL_SUMMARY:END -->
