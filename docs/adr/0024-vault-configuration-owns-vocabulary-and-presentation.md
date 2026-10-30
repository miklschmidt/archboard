---
status: accepted
---

# Vault configuration owns vocabulary and presentation

Canonical policy retains vocabulary and presentation rules. Recursive modules supersede live level classification below without another stored depth.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Partly superseded by [ADR 0038](0038-groups-gather-and-colour-their-cards.md): a
group now has a required color from the curated palette, and that color places
and colors its cards. Configuration ownership and the curated palette stand.

Dogfooding exposed missing board levels and visual styles whose meaning readers
were unable to explain. Each vault will own one version-controlled YAML
configuration that defines its vocabulary and visual policy. So consumers can
describe their domain without embedding drawing instructions in boards. TASK-203
accepted these decisions on 2026-09-13.

## Ownership

CONTEXT.md defines the terms [vault vocabulary](../../CONTEXT.md#meaning), kind,
relationship kind and level. This decision places ownership of their allowed
values with the vault's consumer rather than a hard-coded product enum. So
different architectural domains can use their own classifications consistently
across boards.

A board must declare its level using that configured vocabulary. This keeps the
board-level classification in
[ADR 0013](0013-a-node-records-a-level-only-to-differ-from-its-board.md). It
also makes the vocabulary consumer-defined.

Consumers also define node types and relationship types. A node type has a
display name, optional named color and RemixIcon icon. A relationship type has a
name and configured appearance. These presentation mappings belong to the
configuration. They are not the definitions of the domain terms. Exact
configuration field names remain an implementation-design detail.

Boards store semantic references and structural containment. Configuration owns
their appearance. There are no per-board policy overrides or configuration
snapshots embedded in variants. Changing the policy restyles current, proposed
and historical variants alike. It does not mark architectural subjects as
changed, and it does not rewrite historical content.

The initial editing interface is YAML with a validation schema and CLI
validation, without a configuration editor UI. Saving the configuration
refreshes open boards automatically, and the refresh preserves their cameras and
selections. Failure and recovery follow
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).

## Curated palette

Consumer configuration references curated color names only. It cannot supply raw
color values or define new palette entries. The centrally maintained palette
must make retuning existing colors and adding new names straightforward. That
includes coordinated light and dark appearances. Its initial breadth includes
red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo,
violet, purple, fuchsia, pink and rose. It also includes neutral fallback
colors.

This chooses consistent, legible rendering over arbitrary consumer styling. It
also replaces hash-assigned kind/group colors with explainable configured
meaning. Semantic colors can include colors that are also used for comparison.
The distinct visual channels and explanations in
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) must
preserve the distinction.

## Consequences

One policy applies consistently across the vault. If the current policy changes,
historical drawings change appearance, and that is the cost. Board meaning and
variant identity remain stable. The unpublished branch can break and repair
existing boards. This work does not retain the interim JSON configuration or
introduce a compatibility layer for it.

This extends
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md).
Agents author meaning, and the renderer interprets a consumer's declarative
policy. Required metadata, configured vocabulary and visual policy are separate
concerns even though one vault configuration defines their allowed values.
