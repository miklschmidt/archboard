---
id: TASK-075
title: An agent write returns the elements it touched and a board fingerprint
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:16'
updated_date: '2026-08-21 09:12'
labels: []
dependencies:
  - TASK-068
  - TASK-074
references:
  - src/server.ts
  - src/core/mcp-dispatch.ts
  - src/cli/commands/elements.ts
  - docs/design/server-is-the-truth.md
type: enhancement
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 7 of docs/design/the-plan.md, alongside the browser echo. The user said "the server and the agent", and the literal reading is wrong for a reason that has nothing to do with correctness.

WHY NOT THE WHOLE BOARD. At 300 elements a board is 229,551 bytes of JSON, roughly 60,000 tokens. An agent running `update` twenty times in a loop, as `align` does today, would pull 1.2 million tokens of board through its context to move twenty boxes. At 55 elements, which is the honest size for a real vault board, it is 41,848 bytes per call, around 11,000 tokens, still ruinous in a loop.

And the failure this whole change exists to prevent does not apply to the CLI. A client accumulating divergence over hundreds of patches needs a long-lived copy to accumulate it in. Every CLI invocation is a fresh process that holds nothing between calls.

SO THE AGENT GETS THE SAME GUARANTEE IN A SHAPE IT CAN AFFORD. Three parts:

1. THE ELEMENTS THE WRITE TOUCHED, IN THEIR RESULTING FORM. Not the payload that was sent back, the record as it now stands: the ids the server minted, the bound text it expanded from a label seed, the arrows it re-routed. `PUT /api/elements/:id` already returns the updated element. This extends it to the side effects, which today are only broadcast. That matters most right after TASK-072, because an agent that writes `{"label": {"text": "AuthService"}}` gets back a container and a text element it never named, and today has no way to learn the text element's id except by re-reading the board.

2. A BOARD FINGERPRINT. Element count plus the sha-256 of the note bytes, which costs 0.11 ms at 300 elements. An agent holding the previous fingerprint can tell in one comparison whether anything it did not expect has changed, and call `describe` if so. This is what replaces "read the board every turn to see if the human moved something".

3. THE WHOLE DOCUMENT BEHIND AN EXPLICIT FLAG, for callers that genuinely want it. Off by default, and the flag should be visible enough in help that nobody reaches for it in a loop by accident.

SURFACES. The CLI and MCP both, because they are held at parity by `scripts/check-surface-parity.mjs` and a guarantee that only one of them offers is a guarantee an agent cannot rely on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A write returns every element it touched in its resulting form, including elements the server created as a side effect and did not receive an id for
- [x] #2 A write returns a board fingerprint: element count plus the sha-256 of the note bytes
- [x] #3 The whole document comes back only behind an explicit flag, and the flag says in help why it is not the default
- [x] #4 The CLI and MCP offer the same thing, and check-surface-parity proves it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Server: an agent-origin write answers with `elements` = every element it touched in its resulting form (created + updated, side effects included), plus `fingerprint` = {elements: count, note: sha-256 of the note bytes that board would write}. `document` only when the request asks for it.
2. The same three on the single-element agent routes (POST /api/elements, PUT /:id, DELETE /:id, POST /batch), so the guarantee does not depend on which route a surface happens to use.
3. CLI: --document on apply/add/update/delete, help saying why it is not the default; print elements and fingerprint.
4. MCP: a `document` boolean on create_element, update_element, delete_element, batch_create_elements, with the same wording.
5. check-surface-parity asserts the flag is on both surfaces, so neither can grow it alone.
6. Measure the token cost of touched-elements against whole-document and record it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED.

Every agent write now answers with three things, from one place — `agentWriteAnswer` in src/server.ts, called by POST /api/elements/changes (origin agent), POST /api/elements, PUT /api/elements/:id, DELETE /api/elements/:id and POST /api/elements/batch, so the guarantee does not depend on which route a surface happens to use.

- `elements`: every element the write touched, in the form the board now holds it. Not the payload that was sent: the record as it stands, including what the server made and the caller never named — minted ids, the text element expanded from a `label` seed, arrows re-routed behind a move, the z-order repair TASK-074 added.
- `fingerprint`: { elements, note }. The element count, and the sha-256 of the note this board would write — the bytes, not the store, because the note is the board (ADR 0015) and under stage 8 those are the bytes on disk.
- `document`: the whole board, and only when asked.

MEASURED, on this machine, with a labelled-box board:

  one update, 300-element board:  answer 1,305 bytes (~326 tokens, 2 elements — the box and its label)
                                  --document 175,320 bytes (~43,830 tokens)   134x
  one update, 55-element board:   answer 1,300 bytes (~325 tokens)
                                  --document 32,492 bytes (~8,123 tokens)     25x
  twenty updates in a loop:       ~6,520 tokens against ~876,600 at 300 elements
  a 20-box align (one write):     answer 23,954 bytes (~5,989 tokens, 40 elements: twenty boxes and
                                  twenty labels) against 185,683 (~46,421)     7.8x

The fingerprint is not free — it renders the note and hashes it on every write — but it is inside the noise of the write it rides on: a one-element round trip is 1.10 ms at 55 elements and 3.99 ms at 300, fingerprint included.

THE FLAG. `--document` on apply/add/update/delete, `document: true` on create_element, update_element, delete_element and batch_create_elements. Both say why it is off: 300 elements is about 60,000 tokens and a loop pays it per box. The CLI says it in the usage `archboard help <command>` prints; MCP in the parameter description.

PARITY IS ASKED, NOT READ. check-surface-parity's first version read the usage text for `--document` and was worthless: the shared paragraph every write prints contains the word, so a command that had lost the flag entirely still passed. It now runs `archboard <cmd> --document --not-a-real-flag` and reads which flag `parseArgs` rejected — the parser answering, not the prose — and separately requires the synopsis to mention it, because `archboard help` is the only place a shell agent would find it. It also requires the MCP description to say 'default'.

REVERT-PROOF.
- Revert the changes route to `{ elements: created }`: 3 of 58 check-one-write assertions fail — the touched set no longer covers the two updates, the fingerprint is undefined, and --document answers with nothing. check-mcp-stdio still passes, so one-write is what guards this.
- Take `document` off one MCP tool: 1 parity failure naming the tool and the command.
- Take `--document` off the CLI's `add`: 2 parity failures, one per paired tool.
- Take `--document` out of add's usage synopsis while leaving the flag working: 2 parity failures saying `archboard help` does not say it exists.

bun run test is green, 21 suites.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An agent write answers with the elements it touched in their resulting form — minted ids, expanded labels, re-routed arrows and all — plus a board fingerprint of element count and the sha-256 of the note it would write. The whole board only behind --document / document: true, on both surfaces, each saying why it is off. Measured: one update on a 300-element board answers in 1,305 bytes (~326 tokens) against 175,320 (~43,830) with the flag, 134x, and twenty in a loop is ~6,520 tokens against ~876,600. check-surface-parity now asks the parser which flag it rejected rather than reading the help text, because the shared usage paragraph mentions --document and made the first version pass a command that had lost the flag.
<!-- SECTION:FINAL_SUMMARY:END -->
