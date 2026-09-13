---
status: accepted
---

# Vault configuration owns vocabulary and presentation

Dogfooding exposed missing board levels and visual styles whose meaning readers
could not explain. Each vault will own one version-controlled YAML configuration
defining its vocabulary and visual policy, so consumers can describe their domain
without embedding drawing instructions in boards. These decisions were accepted
in TASK-203 on 2026-09-13; implementation remains pending the completed design review.

## Ownership

The terms [vault vocabulary](../../CONTEXT.md#meaning), kind, relationship kind
and level are defined in CONTEXT.md. This decision places ownership of their
allowed values with the vault's consumer rather than a hard-coded product enum,
so different architectural domains can use their own classifications consistently
across boards.

A board must declare its level using that configured vocabulary. This preserves the board-level
classification in [ADR 0013](0013-a-node-records-a-level-only-to-differ-from-its-board.md)
while making the vocabulary consumer-defined.

Consumers also define node types, with a display name, optional named color and
RemixIcon icon, and relationship types, with a name and configured appearance.
These presentation mappings belong to the configuration; they are not the
definitions of the domain terms. Exact configuration field names remain an
implementation-design detail.

Boards store semantic references and structural containment. Configuration owns
their appearance. There are no per-board policy overrides or configuration
snapshots embedded in variants. Changing the policy restyles current, proposed
and historical variants alike; it does not mark
architectural subjects as changed or rewrite historical content.

The initial editing interface is YAML with a validation schema and CLI validation,
without a configuration editor UI. Saving the configuration refreshes open boards
automatically, preserving their cameras and selections. Failure and recovery follow
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).

## Curated palette

Consumer configuration references curated color names only; it cannot supply raw
color values or define new palette entries. The centrally maintained palette must
make retuning existing colors and adding new names straightforward, including
coordinated light and dark appearances. Its initial breadth includes red, orange,
amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple,
fuchsia, pink and rose, alongside neutral fallback colors.

This chooses consistent, legible rendering over arbitrary consumer styling. It
also replaces hash-assigned kind/group colors with explainable configured meaning.
Semantic colors may include colors also used for comparison; the distinct visual
channels and explanations in [ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md)
must preserve the distinction.

## Consequences

One policy applies consistently across the vault, at the cost of historical
drawings changing appearance when the current policy changes. Board meaning and
variant identity remain stable. The unpublished branch may break and repair
existing boards; this work does not retain the interim JSON configuration or
introduce a compatibility layer for it.

This extends [ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md):
agents author meaning, while the renderer interprets a consumer's declarative
policy. Required metadata, configured vocabulary and visual policy are separate
concerns even though one vault configuration defines their allowed values.
