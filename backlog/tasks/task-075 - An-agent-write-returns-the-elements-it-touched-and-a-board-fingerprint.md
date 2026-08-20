---
id: TASK-075
title: An agent write returns the elements it touched and a board fingerprint
status: To Do
assignee: []
created_date: '2026-08-20 20:16'
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
- [ ] #1 A write returns every element it touched in its resulting form, including elements the server created as a side effect and did not receive an id for
- [ ] #2 A write returns a board fingerprint: element count plus the sha-256 of the note bytes
- [ ] #3 The whole document comes back only behind an explicit flag, and the flag says in help why it is not the default
- [ ] #4 The CLI and MCP offer the same thing, and check-surface-parity proves it
<!-- AC:END -->
