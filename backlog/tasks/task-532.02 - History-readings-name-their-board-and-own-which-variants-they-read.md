---
id: TASK-532.02
title: History readings name their board and own which variants they read
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T04:13:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0045-git-history-is-read-through-bindings-on-request.md
  - docs/adr/0055-packages-own-behavior-and-apps-compose-it.md
parent_task_id: TASK-532
ordinal: 953000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
readFootprint and the locality reading take already-resolved board and variant objects, so the server holds ADR 0045's rule on which variants the history lens reads: apps/server/src/server/rules/footprint/footprint-variants.ts (159 lines) and readableVariant in locality-route.ts. The refusal codes are string literals in the server and again in the CLI. The code check already takes names and resolves boards inside code-intel, so the two readings are the odd ones out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 readFootprint and locality.read take the vault, board name and variant names, and return a reading or a typed refusal
- [x] #2 footprint-variants.ts and readableVariant are gone from the server; the rules live privately in code-intel and the refusal codes come from its shared history entry
- [x] #3 Lifecycle, default-comparison and unresolved-head cases are tested through the code-intel operations; route tests keep status mapping and cancellation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Footprint: move footprint-variants.ts into code-intel as a private selection file (history-lens/footprint-selection.ts) together with the unresolved-head refusal. readFootprint({vault, board, variant?, against?, base, head?, signal}) reads the board by name and returns {ok:true, answer} or a typed refusal {ok:false, code, problem}. The variant-object walk stays as the private in-memory seam the lens tests drive. Route keeps 400/404/422 mapping and hang-up cancellation. Move lifecycle, default-comparison and unresolved-head cases from footprint-route.test.ts into a code-intel test through readFootprint. Commit.
2. Locality: move readableVariant into history-lens/locality-selection.ts; createLocalityReading().read({vault, board, variant?, since?, signal}) reads the board and selects, keeping the remembered answers in the private seam. Route keeps since/query validation, status mapping and cancellation. Move refusal cases into a code-intel test. Commit.
3. Refusal codes: one const in #shared/protocol, exported from @archboard/code-intel/history; CLI refusal objects use it. Interface width of code-intel must stay at or below 16, so one name is dropped (FootprintAnswer becomes unused outside the package once the head refusal moves in; the CLI derives it from FootprintReplySchema).
4. Focused checks, type-check, lint, repository-policy, fmt.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Footprint (bfd428486): readFootprint({vault, board, variant?, against?, base, head?, signal}) in history-lens/footprint-reading.ts reads the board, chooses the variants (moved verbatim from the server's footprint-variants.ts) and refuses an unresolved head (moved from the route). The variant walk stays as readVariantFootprint, the private seam the lens tests drive.
Locality (a4f4b291e): createLocalityReading().read({vault, board, variant?, since?, signal}) in history-lens/locality-reading.ts reads the board and chooses the variant (readableVariant moved from the route). The remembered answers stay in the seam createVariantLocality (locality.ts); one reading by name shares one memory.
Shared: history-lens/admission.ts holds the refusal type {ok:false, code, problem} and the board read. HistoryRefusalCode (const and type of one name) is on @archboard/code-intel/history; the CLI refusals use it. The package graph already lets the CLI import @archboard/code-intel/history.
Width: adding HistoryRefusalCode would raise code-intel to 17 over its ceiling of 16. FootprintAnswer left the shared entry: after the head refusal moved into code-intel its only outside users were the CLI (now z.infer<typeof FootprintReplySchema>) and a route test stand-in (now inferred). Width stays 16.
Behaviour: every status code, refusal code and wire field is kept. One ordering change: a board or variant refusal is now decided inside the checkout work rather than before it, so during a server stop such a request is answered by the checkout work owner's refusal first.
Vault: .archboard/vault/Archboard server routes.semantic.json anchors steps on the symbol readableVariant at an already stale path (src/server/archboard/lib/locality-route.ts); the vault is out of scope.

Review (review/history-admission): the refusal order during a server stop is kept as merged, not restored. Admitting before the checkout work needs a split point in each reading interface: a second exported operation per reading (code-intel would exceed its width ceiling of 16) or a higher-order runner in place of the plain signal in both request types, which every caller and route stand-in must then learn. The difference is reachable only in the quiesce window of a stop (checkoutWork.quiesce runs before the HTTP listener closes, while mutationAdmission drains): a request that names a missing variant or board now gets the same 500 (checkout work is stopping) as a valid request gets in that window, instead of its 422 or 404. The 500 is honest, the same command run again after the restart gets its refusal, and every status and code outside that window is unchanged. Not worth the wider interface.
<!-- SECTION:NOTES:END -->
