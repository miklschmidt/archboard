---
id: TASK-347
title: 'Groups gather their cards into a coloured region, and colour them'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-25 00:11'
updated_date: '2026-09-25 01:07'
labels:
  - renderer
  - frontend
dependencies: []
priority: high
type: feature
ordinal: 588000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User decision 2026-09-25: groups steer layout and carry colour. Today a group is meaning only (a test asserts grouping changes nothing drawn), cards take their body colour from an enclosing container's colour scope (ADR 0025), and groups have no colour (ADR 0024/0025). Decided: (1) every configured group has a mandatory colour; (2) a card is placed with its first group in config.yaml order that has at least two members in the drawn view within its container, else the next, else none; (3) each (container, placing group) pair is a Graphviz cluster, drawn as a faint band tinted with the group colour and captioned with the group name, crossable by lines and never split by a column fold; (4) a card's body border and tint come from its placing group, its icon chip keeps its type colour, and the container colour scope is removed. Optimise for readability at 1080p to 2160p. The dogfood vault defines no groups yet: define groups and memberships where they clarify a board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A group without a colour is refused by the vault check with a diagnostic that names the repair, and every shipped example, fixture and skill reference gives groups a colour
- [ ] #2 Cards sharing a placing group within one container are placed together in one region, and a group with a single member in the drawn view places that card with its next group or none
- [ ] #3 A region is drawn as a faint band in its group's colour with the group's name, lines cross it, and a column fold never splits it
- [ ] #4 A card's body colour comes from its placing group and no longer from its container; its icon keeps its type colour
- [ ] #5 An ADR records groups as the source of region and card colour, superseding the colour-scope rule of ADR 0025 and the group clause of ADR 0024
- [ ] #6 The dogfood vault configures groups and assigns them on the boards they clarify, and the affected boards are rendered and looked at
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Vocabulary half (this branch, task-347-policy); the renderer half (placement, regions, card colour in the painter) is built separately by the parent.
1. GroupPolicySchema becomes { name, color } with a required palette colour; regenerate skill artifacts (generate:skill-artifacts).
2. A group without a colour makes config.yaml invalid: one INVALID_CONFIG diagnostic whose path names groups.<id>.color and whose message says to add color: with one of the palette's colours. Owner: semantic-board-store policy test through checkSemanticVault (shared by archboard check and /api/vault/check).
3. placingGroups(nodes, policy) in shared/semantic-board/lib/groups.ts, exported from the index; unit test in groups.test.ts.
4. Colours on every shipped example and fixture defining groups (INSTALL.md, evals S03/S09, tests); archboard skill references updated to the new rule.
5. ADR 0038; superseded-in-part notes on 0024 and 0025; CONTEXT.md group entry gains its colour.
6. Gate lane by lane: type-check, lint, fmt:check, test:modules, test:system, test:repository.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vocabulary half (branch task-347-policy):
- GroupPolicySchema is { name, color } with color a required palette colour (z.enum over PaletteColorSchema.options, so the same palette, with a custom error that lists the palette). Generated vault-config.schema.json now requires color on every group.
- The INVALID_CONFIG diagnostic now carries path = the first key the schema refused (e.g. groups.payments.color), so archboard check, /api/vault/check and the diagnostics list route the repair to the key; the message says to add color: with one of the palette colours. Decision: one diagnostic per invalid file as before, with the first refused path, rather than one per issue, to keep the existing contract.
- placingGroups(nodes, policy) in shared/semantic-board/lib/groups.ts: first configured group (config order) the node shares with another given node of the same parent; parent undefined = board level; unconfigured ids never place. Quadratic scan, chosen for simplicity at board sizes.
- ADR 0038 states that a container keeps its own kind colour for its own body and passes none to its contents; the parent should confirm that reading of decision (4) when building the painter.
- CONTEXT.md: group entry gains a colour. The Color scope entry is left for the renderer half, which removes the concept in code.
<!-- SECTION:NOTES:END -->
