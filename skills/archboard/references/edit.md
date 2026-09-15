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
   - **Replacement**: a different unit takes its place; remove the old id and
     add the new subject without one. Similar names or paths do not make two
     implementations one unit.
   - **Untouched**: leave it out of the payload entirely.
     For a relationship, changing two or more of `from`, `to`, `kind`, `label`,
     `description`, `emphasis`, effective `traffic` makes it a replacement;
     one change keeps the id.
     Walk the catalogue for what you add: a new part brings its kind,
     containment, binding and groups; a new runtime path brings its traffic;
     a removed part takes its relationships and walkthrough references with
     it.
3. Write it as one batch, naming the `variant` when it is not the current one:

```bash
archboard semantic edit "Flask JSON" --expect-version 3 --doing "routing JSON through the provider" <<'JSON'
{
  "nodes": [{ "name": "DefaultJSONProvider", "kind": "module",
    "responsibility": "dumps, loads and response for the app",
    "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/json/provider.py" } }],
  "edges": [
    { "from": "Flask app", "to": "DefaultJSONProvider", "kind": "data", "label": "app.json" },
    { "from": "JSON helpers", "to": "DefaultJSONProvider", "kind": "call", "label": "current_app.json.dumps" }
  ],
  "removeEdges": ["e7Kq2mP1"]
}
JSON
```

The evidence for the two relationships: `Flask.__init__` (`app.py`) assigns
`self.json = self.json_provider_class(self)`, and `flask.json.dumps`
(`json/__init__.py`) calls `current_app.json.dumps`. The provider binds to
`provider.py`, where `DefaultJSONProvider` is implemented, not to the helpers
that call it.

4. Check the answer against your checks: the ids you meant to keep are
   unchanged, removed subjects are gone, restated subjects still carry the
   fields you kept, `version` moved by one, and nothing landed on a variant
   you did not name. Draw and look when the picture matters. Your answer
   names the catalogue rows the change uses and the ones you judged not to
   apply.

Read [authoring](references/authoring.md) for every removal list, bindings
with revision evidence, groups, and how to repair a refused write.
