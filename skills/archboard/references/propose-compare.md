# Propose and compare a change

The recipe for a proposed evolution of the same diagram: branch a draft, edit
only the draft, compare both through one view, adopt only when asked.

1. `semantic show` the board; note `version` and the variant to derive from.
   The checks: every edit names the proposal in `variant`, so the current
   architecture is byte-for-byte what it was; the ids the proposal keeps; the
   view both pictures will go through.
2. Branch, then edit the proposal:

```bash
archboard semantic branch "Flask contexts" --as "Context variables" --summary "Replace the LocalStacks with contextvars" --expect-version 2 --doing "proposing contextvars"
archboard semantic edit "Flask contexts" --expect-version 3 --doing "rewiring the contexts to contextvars" <<'JSON'
{
  "variant": "Context variables",
  "nodes": [{ "name": "Context variables", "kind": "module", "responsibility": "_cv_app and _cv_request hold the active contexts",
    "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/globals.py" } }],
  "edges": [
    { "from": "App context", "to": "Context variables", "kind": "data", "label": "set / reset" },
    { "from": "Request context", "to": "Context variables", "kind": "data", "label": "set / reset" }
  ],
  "removeNodes": ["App context stack", "Request context stack"]
}
JSON
archboard semantic rasterize "Flask contexts" --view Contexts --out current.png
archboard semantic rasterize "Flask contexts" --view Contexts --variant "Context variables" --out proposal.png
```

The proposal carries every subject of its predecessor with the same ids, so
the comparison is exact: kept ids read as continuing, new subjects as added,
removed ids as removed. Views belong to the board, so both pictures go through
the same view and a removed subject stays drawn as removed. The evidence for
the rewiring is in `src/flask/ctx.py` of Flask 2.2: `AppContext.push` and
`RequestContext.push` call `_cv_app.set` and `_cv_request.set` from
`globals.py`, where the context variables are defined.

3. Check the answer's comparison against your change map: the added, removed,
   changed and unchanged subjects are the ones you intended, the current
   variant is untouched, and a continuing exchange compares step by step.
   Open both pictures: the removal is drawn as removed in the proposal's, and
   the current one shows what it showed before. Report what changed in those
   terms: the parts removed, the parts added, and for every relationship the
   proposal keeps or adds, where it now lands (here, both contexts' `set /
reset` relationships land on `Context variables`). A relationship whose
   endpoint moved is the change the comparison exists to show, so name it.
4. Only when asked, adopt with the version returned by the proposal edit:
   `archboard semantic adopt "Flask contexts" --variant "Context variables" --reason "Flask 2.2 implements contexts with contextvars" --expect-version 4 --doing "adopting context variables"`.
   The proposal becomes current, the previous current becomes historical, and
   nothing is renamed.

Read [variants](references/variants.md) for what the comparison counts, for a
proposal that holds disagreements after its predecessor moved (`semantic
resolve`), and for adoption rules.
