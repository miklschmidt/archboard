# Create an architecture diagram from code

The recipe for a board that answers "what are the parts and how are they
wired": read the source, do the evidence steps in `SKILL.md`, walk its
catalogue, write one payload, look at the picture.

1. Read the source you will describe, do the evidence steps in `SKILL.md` and walk
   its catalogue. Decide the
   board's level from `config.yaml` (`system`: collaborating services;
   `service`: the modules of one; `module`: the functions inside one) and its
   subject: a short name such as `Flask request pipeline`, never a path. Two
   rows need a read before the payload: the configured `groups`, so each
   part lists the concerns it serves, and `archboard semantic`, so a part
   whose internals already have a board links to it with `drillDown`.
2. If parts will be bound to code, register the checkout once:
   `archboard repo add /path/to/checkout` prints the repository identity
   (`github.com/pallets/flask`); bindings use that identity and a repo-relative
   path.
3. State the architecture in one payload and create the board. The evidence
   behind this one, from `src/flask/app.py` in Flask 3.0: `Flask.wsgi_app`
   pushes a `RequestContext` (`ctx.py`) and calls `full_dispatch_request`;
   `full_dispatch_request` calls `preprocess_request`, then
   `dispatch_request`, then `finalize_request`, one after another from its own
   body, so those three are siblings, not a chain. The WSGI server is the
   inbound caller and lives outside the checkout, so it stays unbound.

```bash
archboard semantic new "Flask request pipeline" --doing "describing one request through Flask" <<'JSON'
{
  "level": "service",
  "nodes": [
    { "name": "WSGI server", "kind": "external", "responsibility": "Calls the application once per request" },
    { "name": "Flask app", "kind": "app", "responsibility": "The WSGI application object",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "Flask.wsgi_app", "kind": "function", "parent": "Flask app",
      "responsibility": "Pushes the request context and dispatches",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "Request context", "kind": "module", "parent": "Flask app",
      "responsibility": "Binds request and session for one request",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/ctx.py" } },
    { "name": "full_dispatch_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Preprocess, dispatch and finalize one request",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "preprocess_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Runs the before-request hooks",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "dispatch_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Calls the matched view function",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } }
  ],
  "edges": [
    { "from": "WSGI server", "to": "Flask.wsgi_app", "kind": "call", "label": "environ, start_response" },
    { "from": "Flask.wsgi_app", "to": "Request context", "kind": "call", "label": "push" },
    { "from": "Flask.wsgi_app", "to": "full_dispatch_request", "kind": "call" },
    { "from": "full_dispatch_request", "to": "preprocess_request", "kind": "call" },
    { "from": "full_dispatch_request", "to": "dispatch_request", "kind": "call" }
  ]
}
JSON
archboard semantic rasterize "Flask request pipeline" --out pipeline.png
```

Each relationship lands on the part that actually receives the call, inside
its `parent`; the renderer carries the line across the container boundary.
A container is an endpoint only for a relationship to the whole module.
`Request context` receives `push` here because it has no children; the
moment you draw `push` and `pop` inside it, the call lands on `push`.

4. Check the answer against your record: every part you meant is there with a
   configured `kind`; every relationship's `from`, `to` and `kind` match the
   line of evidence you kept for it, and no relationship exists that you have
   no line for; bound parts name the identity from step 2 and the owning file.
   Open the picture and read it as the audience will: the labels legible,
   nothing cut off, each arrow ending on the part its evidence names. A board
   nobody can follow whole (a dozen or more parts, routes crossing the page)
   gets a board `view` per reading a person will want (one container's
   internals, one path, the parts one concern touches); a view is the answer to
   a tangle, never a smaller or falser board. A request path the board carries
   is a `flow` drawn through a `data-flow` view, not a row to declare
   inapplicable. A picture the request names goes where it says; one you draw
   to look at goes in a temporary directory, never into the checkout you are
   describing. Your answer names the catalogue rows the board uses and the ones
   you judged not to apply.

Read [authoring](references/authoring.md) for groups, drill-down links to
detail boards, traffic, emphasis, descriptions, and what a refusal means.
