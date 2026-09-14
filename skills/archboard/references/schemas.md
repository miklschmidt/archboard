# Schemas and setup references

The files under `generated/` beside this document are derived from the
archboard build that installed this skill. They are regenerated on every
install and every skill sync, so the copy you are reading matches the CLI you
are running. Do not edit them.

| File                                                                                         | Describes                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`generated/semantic-create-input.schema.json`](generated/semantic-create-input.schema.json) | The JSON you give `archboard semantic new`: `level`, then `nodes`, `edges`, `flows`, `views`, `walkthroughs`, using authoring names and same-write handles. |
| [`generated/semantic-edit-input.schema.json`](generated/semantic-edit-input.schema.json)     | The JSON you give `archboard semantic edit`: one batch of restated subjects and `remove...` lists against one `variant`.                                    |
| [`generated/semantic-board.schema.json`](generated/semantic-board.schema.json)               | One persisted board family as `archboard semantic show` prints it and the vault stores it: variants, lifecycle, ancestry, ids.                              |
| [`generated/vault-config.schema.json`](generated/vault-config.schema.json)                   | `<vault>/.archboard/config.yaml`: levels, node kinds with icons and colors, relationship kinds, groups.                                                     |
| [`generated/INSTALL.md`](generated/INSTALL.md)                                               | The installation and vault setup manual, copied from the active checkout that supplies the installed CLI; links into that checkout are absolute.            |

## Authoring payloads are not the persisted document

`semantic new` and `semantic edit` take the two authoring schemas. They differ
from the persisted document on purpose:

- A reference is a **name, an id, or a same-write handle** (`as`). The write
  boundary resolves it; the document holds only ids.
- A **new subject leaves `id` out**; the product mints one. A stated `id` must
  name a subject already on the variant, or the write is refused.
- Each restated subject **replaces its previous definition whole**, so restate
  the fields you want to keep.
- Everything the family owns — `schemaVersion`, `kind`, `id`, `version`,
  timestamps, variant ids, `lifecycle`, `parent`, `current`, `adoptions`,
  `reconciliation` — is an outcome of a write, never something you author.

Read the persisted schema to interpret what `semantic show` returns and to
compare variants; write against the authoring schemas.

## What JSON Schema cannot express

Each generated schema carries an `x-archboard.runtimeObligations` list. A
payload that validates against the schema can still be refused by the CLI when
it breaks one of them. The ones that matter while authoring:

- Every authored reference must resolve against the variant being changed: edge
  ends, flow participants, step ends, a newly stated view selection and beat
  subjects name things that write can see, and a name that matches two nodes is
  ambiguous rather than picked. A board-owned view can later select an id that
  another variant does not hold; inherited ids are what make the view carry
  across the variants where that subject still exists.
- Within one variant, every node, relationship, flow, step, walkthrough and beat
  shares one id namespace. Inherited ids deliberately repeat across variants so
  that a proposal remains comparable with its parent. Board, variant and
  board-owned view ids must not collide with those subject ids.
- Node containment and variant ancestry must both resolve and be acyclic.
- Variant ids and names and board-owned view ids and names are unique. The
  schema version must be supported, exactly one variant is marked current, and
  the board's `current` designation must name it. Reconciliation references must
  agree with the variant's parent and a real board version.
- Flow participants and step ends, walkthrough beats and their subjects/views,
  nonempty view selections, self steps and canonical persisted group ordering
  are checked across fields after the document has matched the schema shape.
- `level`, `kind` and `groups` must be keys the vault configuration defines
  while that configuration is valid; a definition removed later keeps existing
  references readable with a warning.
- `groups` is a set: duplicates and order do not matter on input, and the
  document stores it sorted with no duplicates, or omits it when empty.
  Refusals name the rule and the subject, so read the refusal and repair the
  payload rather than changing the vocabulary or inventing an id.

## Vault setup

The configuration file is authoritative for a vault's vocabulary. Validate an
edit against `generated/vault-config.schema.json`; it requires unique levels
and nonempty node and relationship kind maps, and its `icon` enum is the exact
set of RemixIcon names the installed build accepts. For where the vault lives,
how `ARCHBOARD_VAULT` is set, and how the skill and the repository block are
installed, follow [`generated/INSTALL.md`](generated/INSTALL.md).
