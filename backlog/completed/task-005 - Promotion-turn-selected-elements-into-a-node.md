---
id: TASK-005
title: 'Promotion: turn selected elements into a node'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 14:49'
updated_date: '2026-08-19 15:37'
labels:
  - needs-triage
dependencies:
  - TASK-004
ordinal: 5000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A set of elements can be declared a node with a kind
- [x] #2 Promotion optionally binds the node to a logical address in one call
- [x] #3 Works from a selection made by hand, so no element ids need typing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New pure module src/core/promote.ts:
   - KINDS vocabulary (service, queue, datastore, gateway, external); unknown kind rejected with a message naming the valid ones.
   - slugify(label) -> node id; uniqueness enforced against node ids already on the board (-2, -3 ...). Explicit --node overrides.
   - resolveBinding({path, repo, branch, commit}): shell out to git to find the repo root containing the path, derive repo identity from origin remote (host/owner/name) else toplevel basename, record path relative to root, branch and commit (ADR 0004 traceability), confirmedAt. link = file:// only when the path really exists; otherwise logical address recorded and link left unset.
   - planPromotion / planDemotion produce element update payloads; customData.archboard merged, never flattened, other customData keys and foreign namespaces preserved (ADR 0003).
2. Multi-element decision: one node from the whole selection (default). One call carries one kind, one name, one binding = one node's worth of meaning. --each promotes each selected shape separately (kind only, name/binding rejected) for the 'these are all services' utterance.
3. describe.ts: fold elements sharing customData.archboard.node into a single node in describeScene and buildSelectionReport (primary = largest area), so a 3-element node reads as one node, not three. Surface the node id on the node line and in SelectedElement.
4. CLI commands promote / demote in src/cli/commands/promote.ts, registered in run.ts. Default target is the live selection; --ids overrides. JSON out with a speakable summary; --text prints just the summary.
5. MCP tools promote_selection / demote_selection in mcp-tools.ts + mcp-dispatch.ts, descriptions written for the voice path.
6. Demotion operates on whole nodes: selecting any member demotes every element sharing that node id, stripping customData.archboard and the link we set.
7. Verify behaviourally: build, start canvas, drive Chrome, click-select real shapes, promote, read back via describe and selection --text, export/import round-trip to prove the node id survives. Then bun run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implemented

New `src/core/promote.ts` (pure planning + git resolution), `src/cli/commands/promote.ts` (`promote` / `demote`), MCP tools `promote_selection` / `demote_selection`, and node-aware folding in `src/core/describe.ts`.

### Multi-element decision: one node from the whole selection

Default is **one node out of everything selected**. A promotion carries exactly one kind, one name and one binding — one node's worth of meaning — and that is what the utterance it exists for supplies ("map this to the payments service", said over however many boxes are lit up). Splitting one kind and one binding across five shapes would invent four bindings nobody stated. A shape and its bound label are one thing either way: bound labels are folded into their container before grouping, so promoting a container promotes its label element too, and a label whose container is also selected never becomes a node.

`--each` covers the other real utterance, "these are all queues": one node per selected shape, each named from its own label. It accepts a kind (plus variant/level) and refuses --name/--node/--path, because those are per-node and only one was supplied.

Consequence handled: `describe` counted one element = one node, so a 3-element node would have read as 3 nodes. `foldNodes` now folds elements sharing a node id into their largest member ("element pay-box +1 more"), in both `describeScene` and `buildSelectionReport`, and edges bound to a member resolve to the node's primary.

### Node identity

`customData.archboard.node` = slug of the name (lowercase, non-alphanumeric collapsed to -, 48 chars max), made unique on the board with -2, -3 … A re-promotion keeps the node's existing id (its own id is not counted as taken), so renaming or rebinding never breaks the join key. `--node` forces an id, validated through the same slug shape so ids stay comparable across boards.

### Binding

`--path` resolves through git: repo identity from the origin remote normalised to host/owner/name (ssh and https clones agree), path relative to the repo root, branch and commit at which the binding was confirmed, plus confirmedAt (ADR 0004). `--repo/--branch/--commit` override. `link` is set to file://<abs> only when the path actually resolves on this machine; an unresolvable path still records the logical address and reports why there is no link. Rebinding clears a link the previous binding left behind rather than leaving the shape tappable to the file it used to mean.

`name` is only stored when it differs from the label the board shows — a stored copy of the label goes stale the moment a human retypes it. When they diverge the node line says `declared "X"`. An already-declared name outranks any derivation on re-promotion.

### Reversibility

`demote` works on whole nodes: touch any element of a node and every element of it comes back down. It strips only the `archboard` block (another tool's customData is not ours to delete, verified against a `latex` key) and clears `link` only when the link was the one our binding put there.

Kind is validated against the CONTEXT.md vocabulary; the CLI names all five valid kinds in the error, and the MCP schema carries them as an enum.

## Verification (behavioural, with Chrome attached)

Built with bunx tsc + bunx vite build, canvas restarted, page open at 127.0.0.1:3000.

Real clicks (click, then shift-click) on two labelled rectangles:

```
$ ./bin/canvas selection --text
2 elements selected: 2 plain elements (rectangle(2)) — "Payments API" and "Payments Worker".

$ ./bin/canvas promote --kind service --name "Payments" --path src/core/promote.ts --level service --text
Promoted 4 elements to the service "Payments" (node payments), bound to
github.com/miklschmidt/archboard:src/core/promote.ts@main (62f0cef).

$ ./bin/canvas selection --text
1 element selected: 1 node (service(1)) — "Payments API".
  <payments> "Payments API" | element pay-box +1 more | declared "Payments" | bound
  github.com/miklschmidt/archboard:src/core/promote.ts@main (62f0cef) | ... | from board

$ ./bin/canvas describe
Total elements: 6 (1 node, 0 edges, 1 plain, 3 bound labels folded in, 1 node member folded in)
Kinds: service(1) | Variants: current(1) | Levels: service(1) | Bindings: 1/1 bound to code
```

4 elements = 2 shapes + their 2 bound labels, folded into one node. No ids typed.

- **Human drag survives**: dragged the promoted worker box in the browser; position changed to (694,748) and node/kind/binding/link were all intact in `get`.
- **Export/import round-trip**: node id present 4x in the exported .excalidraw; after clear + import, `describe` still reads `<payments> ... element pay-box +1 more` and `query --filter customData.archboard.node=payments` returns the same 4 elements.
- **--each from a real 2-shape selection**: "Promoted 2 elements to queues: "Order Queue" (order-queue), "Email Queue" (email-queue)"; --each with --name or --path refused.
- **demote from a real selection**: "Demoted 2 nodes ... back to 4 plain elements", canvas back to "no nodes yet".
- **Duplicate labels**: two "Payments API" boxes -> payments-api and payments-api-2.
- **Foreign customData**: a `latex` key survived promotion and demotion.
- **Unknown kind**: `Unknown kind "microservice". Valid kinds are: service, queue, datastore, gateway, external.` (exit 1); MCP rejects at the schema enum.
- **MCP**: promote_selection and demote_selection driven over stdio against dist/index.js, both returned the speakable summary plus the node JSON.

`bun run test` passes (5 MCP stdio wire checks + loopback bind check). Canvas left cleared, browser tab closed.

Not done, deliberately: promotion does not Excalidraw-group a multi-element node (`arrange group` already exists and grouping changes drag semantics on the board); demotion does not restore a link that predated the promotion.

Orchestrator verification: promoting two elements to one node bound via git produced 'github.com/miklschmidt/archboard:src/core/promote.ts@main (62f0cef)' — repo identity, path, branch and commit exactly as ADR 0004 specifies. describe folds them correctly ('1 node, 1 node member folded in') and the summary reads '1 service with no edges drawn yet'. Node id survived export -> clear -> import with both elements still carrying it. Unknown kind rejected with a message naming all five valid kinds and the policy for adding one. Demote restored plain elements. bun run test green, tsc and vite build clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Promotion declares a selection to be a node: one node from the whole selection (matching the utterance, which carries one kind and one binding), with --each for one-node-per-shape. Node ids are label slugs made unique per board and stable across re-promotion, so the join key survives renaming and rebinding. Bindings resolve through git to repo identity, path, branch and commit. describe and the selection report fold multi-element nodes. Verified with real browser clicks and a CLI round-trip.
<!-- SECTION:FINAL_SUMMARY:END -->
