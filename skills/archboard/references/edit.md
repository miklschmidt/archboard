# Edit an existing board

The recipe for changing what a board already says: read it, map the change
onto its subjects, write one batch at the version you read, check the answer.

1. `archboard semantic show <board>` and note `version`, the target variant's
   ids, and the fields of every subject you will restate. Write the checks:
   which variant the change lands on, which ids must survive, which fields you
   are keeping and which you are changing. Read the source for the region you
   touch: when the board already contradicts it there (a call drawn from the
   wrong part, a membership the code does not support), say so in your
   answer, and change it only when the request covers it; a board you were
   asked to extend is not yours to silently repair or silently repeat.
2. Map the change onto what you read, subject by subject:
   - **Continuing**: the same part, relationship, exchange or step evolves; keep
     its `id` (a rename, a reworded responsibility, a new binding).
   - **Restore**: a removed inherited node or relationship returns; use its
     original `id` and full properties from the direct predecessor or recorded
     reconciliation base. Remove any copy and reconnect edges, flows and view
     selections in the same batch. Do not put the restored id in removals.
     An id absent from both sources cannot be restored here.
   - **Replacement**: a different unit takes its place; remove the old id and
     add the new subject without one. Similar names or paths do not make two
     implementations one unit.
   - **Untouched**: leave it out of the payload entirely.
     Two or more of `from`, `to`, `kind`, `label`, `description`, `emphasis`,
     effective `traffic` differing makes a relationship a replacement; one
     keeps its id. The count is against the variant this one came from — a
     current variant has one too — over every edit since, not what you just
     read, so one you never touched may already be a difference from its
     limit. Restate one whose endpoint moved with its id, in the same batch.
     Walk the catalogue for what you add; a removed part takes its
     relationships and walkthrough references with it.
3. Write it as one batch. `--variant <id|name>` says which variant it lands on,
   as it does on every variant command; leave it out and the change lands on the
   current variant. The batch's own `variant` field says the same thing, so say
   it once: the command line wins over it, and the write warns naming both.

```bash
archboard semantic edit "Board store" --expect-version 3 --doing "routing write warnings through their own module" <<'JSON'
{
  "nodes": [{ "name": "Replaced relationships", "kind": "module",
    "responsibility": "Names every relationship a batch stated again under a new id",
    "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/replaced-relationships.ts" } }],
  "edges": [
    { "from": "Edit content", "to": "Replaced relationships", "kind": "call", "label": "replacedRelationships" },
    { "from": "applyUnderLease", "to": "persisted", "kind": "call", "label": "notices as warnings" }
  ],
  "removeEdges": ["e7Kq2mP1"]
}
JSON
```

The same batch lands on a proposal by naming it, with nothing else about the
call changing:

```bash
archboard semantic edit "Board store" --variant "Warnings as their own module" --expect-version 3 --doing "routing write warnings through their own module" < change.json
```

The evidence for the two relationships: `editContent` (`edit-content.ts`)
returns the notices `replacedRelationships` computes, and `applyUnderLease`
(`write.ts`) hands the transition's notices to `persisted`, which turns them
into warnings; the removed `e7Kq2mP1` had drawn `persisted` reading them from
`Edit content` directly. The new module binds to `replaced-relationships.ts`,
where `replacedRelationships` is implemented, not to `edit-content.ts`, which
calls it.

4. Check the answer against your checks: the ids you meant to keep are
   unchanged, removed subjects are gone, restated subjects still carry the
   fields you kept, `version` moved by one, and nothing landed on a variant
   you did not name. Draw and look when the picture matters.

Read [authoring](references/authoring.md) only when the change needs it: a
removal beyond `removeEdges`, a binding with revision evidence, group
membership, a drill-down link, or a refusal you must repair. A change of one
property on subjects you read needs nothing beyond this recipe.
