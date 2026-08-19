---
id: TASK-007
title: 'compare: structured semantic diff between two variants'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 14:50'
updated_date: '2026-08-19 19:02'
labels:
  - needs-triage
dependencies:
  - TASK-003
ordinal: 7000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Structured output only; prose is the agent's job, never the tool's
- [x] #2 Diff is keyed on node identity, not element ids or geometry
- [x] #3 The data is sufficient to explain the difference without a second call: nodes and edges added, removed and changed, with what changed about each
- [x] #4 Layout change is represented in a way that carries meaning, not raw coordinate deltas
- [x] #5 What is unchanged is stated, so the agent can say what is stable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Goal: SUFFICIENCY. The output must contain everything a Codex thread needs to explain the difference between two boards, unabridged. No prose, no truncation.

1. src/core/compare.ts — pure function compareBoards(from, to) over two element arrays + identities. No I/O, so it is testable headless.
   - Node model: group elements by customData.archboard.node (a node is a SET of elements, as promotion writes it). Facts per node: node id, label, declared name, kind, level, variant, binding (full logical address), link, elementIds, element count, geometry (union bbox + primary element).
   - Node diff: added / removed / changed / unchanged. changed carries per-field {from,to} for kind, label, declaredName, binding (repo+path+branch; commit/confirmedAt reported but not treated as a change), link, level, variant, plus any other keys in the archboard block, plus elementCount.
   - Edge model: connectors resolved to node ids at both ends (via the same element->node map, so an arrow bound to any member of a node names the node). Edge key is fromNode->toNode; parallel edges disambiguated by label then ordinal. Diff added/removed/changed(label)/unchanged, plus a 'rerouted' inference layer (a removed and an added edge sharing exactly one endpoint), clearly marked as inference and additive to added/removed. Connectors whose ends do not resolve to nodes are reported per-side as unresolved, never diffed.
2. Layout — represented as relative structure, never coordinate deltas. Five carriers, each scale- and translation-invariant:
   - clusters: proximity clustering (union-find, describe.ts's 160px gap) as a partition of node ids; diff = partition diff (formed/dissolved/merged/split + per-node cluster moves).
   - containment: the smallest element strictly containing a node, keyed by node id or by label for a plain boundary box; diff of parent.
   - groups: explicit Excalidraw groupIds as a second partition of node ids (groupIds are random per board, so membership is what compares).
   - region: node position normalised to the NODE bounding box, bucketed 3x3 (top-left..bottom-right); diff of region name.
   - relative order: coarse pairwise relation (above/below/left-of/right-of/overlapping) computed only for pairs that are edge-connected or co-clustered on either side; diff = relation flips.
   - prominence: node area relative to the median node area (smaller/typical/larger); diff of class.
3. Non-node elements: no stable id, so never diffed as nodes. Per-side inventory (counts by type, every labelled plain element with label/type/region/human-drawn flag) plus a clearly-labelled label-match hint for labelled plain shapes present on one side only. They also participate as containment parents.
4. Loading: server resolves each side read-only — in-memory copy when the board is already open (unsaved work is the truth), else readBoardFile straight from the vault WITHOUT registering it in the store, recording no baseline and never calling setActiveBoard. Active-board semantics (TASK-003) and the ADR 0006 baseline are untouched. Each side reports source: canvas|vault.
5. Surfaces: GET /api/boards/compare?from=&to= ; canvas-client.compareBoards(); top-level CLI `compare <from> [to]` (JSON on stdout, per the CLI convention); MCP tool `compare_boards`. One positional resolves the other side from the vault's variants of that board and errors listing them when ambiguous.
6. Edge cases: no variants (error naming what exists), missing side (404 naming the vault and the variants), zero shared node ids (succeeds, warns, and label-matches so the agent can say 'nothing was promoted'), a node id whose elements are scattered across clusters (warning, still one node).
7. Verify behaviourally with a real vault and two hand-built variants: node added, edge rerouted, binding changed, node moved between clusters; plus an identical-copy run and a nothing-promoted run. Then bun run test + type-check, canvas left cleared.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Surfaces: CLI `compare <from> [to]`, MCP `compare_boards`, REST `GET /api/boards/compare?from=&to=`. Core is `src/core/compare.ts` (pure, no I/O); proximity clustering and region naming extracted to `src/core/layout.ts` and shared with `describe`, so a cluster the read-back names is the same cluster the diff says was split.

Diff model. Join key is `customData.archboard.node`; a node is the SET of elements carrying that id (bound labels folded in), primary = largest. Semantic fields diffed with before/after: label, declaredName, kind, level, binding (repo+path+branch — commit and confirmedAt are reconfirmation noise and are carried in the facts but never counted), link, elementCount, and any other keys in the archboard block. Colour, stroke, shape and absolute size are segregated as `cosmeticChanges` and never count as an architecture change. Every node — added, removed, changed or unchanged — carries full facts including in/out node ids and degree, so an added node explains itself without a cross-reference.

The node's own `variant` field is deliberately NOT diffed: promotion stamps every node with its board's variant, so comparing two variants would report all six nodes as changed and leave nothing for "what is stable". What IS diffed is disagreement — a node whose variant is not its board's, which means it was copied and never re-promoted; that also raises a warning. Caught in behavioural testing, where a raw file copy correctly surfaced as six stale nodes.

Edges are keyed on the node ids they connect, never element ids; parallel edges match by label first then positionally. Changed edges report label, connector type, strokeStyle, arrowheads and edge metadata. `rerouted` is an additive inference layer over added/removed (a removed and an added edge sharing exactly one endpoint, one-to-one) so "Payments now points at Settlement instead of Ledger" does not have to be reconstructed. Connectors with an end that is not a node are reported per side as `unresolved` with a reason, never diffed.

LAYOUT — six signals, all relative, all invariant under panning, zooming and wholesale tidying: cluster membership (as the set of co-located node ids, restricted to nodes on both boards so an added neighbour cannot make its neighbours look moved), containment (smallest shape strictly containing the node, keyed by node id or by the container's label), Excalidraw group membership (unrestricted — grouping is an explicit act about the nodes named in it), region (thirds of that board's own node bounding box), coarse pairwise direction (above / left-of / above-left …, only for pairs edge-connected or co-clustered on either side), and prominence (area against the board's median node). Reported both per node (`layout.moved`) and as partition diffs (merged / split / formed / dissolved).

WHAT LAYOUT CANNOT EXPRESS — shipped in the output as `layout.cannotExpress` so the narrator cannot overclaim: absolute position (a board panned or redrawn at another scale reports nothing — that is the point); movement below the thresholds (a nudge crossing neither a region third nor the 160px cluster gap); tidiness (alignment, spacing, orthogonal routing); edge geometry (an edge dragged round an obstacle keeps its endpoints); ordering between clusters that share no edge; and region names being relative to each board's own frame, which `boxAspectDiverged` warns about.

NON-NODE ELEMENTS are never added/removed/changed — a plain shape has no identity across independently authored boards and pretending otherwise is false precision. They appear as an exhaustive per-side inventory (every labelled shape with label, type, region, human-drawn flag, foreign customData; unlabelled counted by type), a clearly-marked label-match hint, and `unidentified` — elements carrying archboard metadata but no node id, which are one promotion away from comparing. They also serve as containment parents, which is how "someone drew a boundary round these three" survives.

Loading does not disturb the canvas: a board already open is read from memory (unsaved work included), any other via readBoardFile straight from the note. Nothing is registered in the store, no baseline is recorded (ADR 0006 untouched) and setActiveBoard is never called. Verified: active board and open-board list identical before and after.

`summary.comparable` distinguishes "nothing differs" from "nothing could be compared", and `identical` is only ever true when the join found something — otherwise two unpromoted boards that look nothing alike would report identical.

VERIFICATION (behavioural, real vault at <scratchpad>/vault-cmp, two variants authored with disjoint element ids and a +2300/+480 coordinate offset to prove the layout model is relative).

payments (current): api-gateway -> payments -> {payment-events, ledger, fraud}, ledger -> payments-db, fraud external and far off to the right.
payments@option-a: Settlement inserted, fraud brought in-house, Payment Events moved next to fraud, a "Payments Platform" boundary box drawn round the front three, Payments drawn bigger, plus an unpromoted "Webhooks?" box and a "Reconciliation" box with metadata but no node id.

  summary   {"comparable":true,"identical":false,"sharedNodes":6,"nodesAdded":1,"nodesRemoved":0,
             "nodesChanged":2,"nodesUnchanged":4,"nodesMovedOnly":4,"edgesAdded":2,"edgesRemoved":1,
             "edgesChanged":1,"edgesUnchanged":3,"layoutSignalsChanged":19}
  added     settlement [service] in:payments out:ledger cluster:[api-gateway,ledger,payments,payments-db] container:label:Payments Platform
  changed   fraud   {label: Fraud Provider->Fraud Check, kind: external->service, binding: null->github.com/acme/pay:src/fraud/check.ts@main}
            ledger  {binding: src/ledger/service.ts@main -> src/settlement/ledger.ts@main}
  stable    api-gateway (moved: cluster,container), payment-events (cluster,region),
            payments (cluster,container,prominence), payments-db (cluster)
  edges     + Payments->Settlement "posts", Settlement->Ledger   - Payments->Ledger "posts"
            ~ payments->fraud {strokeStyle: solid->dashed}
            = API Gateway->Payments, Payments->Payment Events, Ledger->Payments DB
  rerouted  Payments now points at Settlement instead of Ledger; Ledger is now fed by Settlement instead of Payments
  unresolved Payments -> Webhooks? (the target end lands on an element that is not a node)
  clusters  from c1:[api-gateway,ledger,payment-events,payments,payments-db] c2:[fraud]
            to   c1:[api-gateway,ledger,payments,payments-db,settlement] c2:[fraud,payment-events]
            split c1->c1 joined:[settlement] left:[payment-events]; merged c1,c2->c2
  relations 8 flips, e.g. "ledger was right-of payments, now below", "fraud was right-of payment-events, now above"
  plain     Payments Platform, Webhooks?, Reconciliation; unidentified: Reconciliation {kind:service}
  30.4 KB of JSON, every list complete.

Other cases exercised:
- Identical copy (payments@twin, re-stamped so the variant matches its board): comparable true, identical TRUE, 6 nodes and 5 edges listed as unchanged, no warnings. The same file copied WITHOUT re-stamping correctly came back as six stale-variant nodes plus a warning explaining it is the trace of a copy.
- Nothing ever promoted (sketch vs sketch@option-a): comparable FALSE, identical FALSE, warning states the empty sections mean "could not be compared", label matching still reports Payments/Ledger on both and Settlement only on the right.
- One side unpromoted, and two different board names: both warnings fire.
- Unsaved in-memory edit on an open board: picked up (source "memory", to.active true), the extra node appears as added, and the active board plus the open-board list are byte-identical before and after the compare.
- Groups: two nodes grouped -> groups.changes [formed g1 joined:[ledger,settlement]] and moved.ledger.group null->["settlement"].
- A node id spread across two places on one board: still one node, with a warning that its geometry is the box round all of them.
- Errors: no variants; ambiguous (3 variants, lists them); one side missing (names what exists under that board); both missing; same board twice; no args (exit 2 with usage).
- MCP over stdio: compare_boards listed and dispatched, 31 KB payload, one-argument form resolves, error path returns the same message.
- `describe` re-checked after the layout.ts extraction: unchanged output.
- bun run type-check clean; bun run test green (5 stdio wire checks, loopback bind, 108 obsidian-md checks). Canvas cleared and stopped.

Fixture kept at <scratchpad>/vault-cmp (payments, payments@option-a, payments@twin, sketch, sketch@option-a, solo) for the end-to-end voice test.

Orchestrator verification against the fixture vault. payments vs payments@option-a returns enough to state the difference without a second call: settlement added with kind and endpoints; fraud carrying label, kind and binding before/after; ledger's binding move; and a rerouted inference naming that Payments now points at Settlement instead of Ledger. layout.cannotExpress ships in the output with 7 entries, so the narrating agent cannot overclaim about movement. Identical copy reports identical:true with all 6 nodes and 5 edges stable. The never-promoted case reports comparable:false with a warning stating explicitly that empty means 'could not be compared', not 'unchanged' — that is the trap that would otherwise have an agent confidently say nothing changed. Active board unchanged across two compares. bun run test and type-check green.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 18:37
---
Emphasis corrected by the user. I had scoped this toward narratability and a 1000-token voice budget; that is wrong. The consumer is a full GPT-5.6-sol Codex thread that can narrate, and can ask clarifying questions back through GPT-Live — that round trip already works in the harness. So the tool's job is SUFFICIENCY: make sure the data needed to explain the difference between two boards is present. Do not pre-digest it into prose, and do not truncate for a budget the agent does not have.

User: 'we just need to make sure the data is there to explain what the difference is between the two boards.'

This unblocks their end-to-end voice testing — they cannot test the loop without it.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
compare produces a structured diff between two board variants joined on customData.archboard.node, since independently authored variants share no element ids. Nodes and edges carry added/removed/changed with before-and-after for every semantic field; cosmetic changes are segregated and never count as changed. Layout is expressed through six relative signals (cluster, containment, group, region, relation, prominence) invariant under panning, zooming and tidying, and the output states what those signals cannot express. Non-node elements appear as an inventory rather than being diffed, because a plain shape has no identity across boards. Comparing never disturbs the active board.
<!-- SECTION:FINAL_SUMMARY:END -->
