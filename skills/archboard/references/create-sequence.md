# Create a sequence diagram

The recipe for a board that answers "what happens, in what order, for one
request or job": a `flow` over the parts it moves between, drawn through a
`data-flow` view.

A sequence is a `flow` on the board that holds its participants; create the
parts, the relationships the messages travel and the flow in the same write,
add a `data-flow` view over it and, when the reader needs narration, a
walkthrough. The board itself is the architecture picture: it draws each
message of the flow as a dashed step line where no relationship joins those
two parts, so an exchange is never a row of unjoined cards, but a step line is
a reading, not a relationship. Every call the exchange makes is also an `edge`
between its participants, with the same line of evidence, because the
relationship is what carries the kind, the traffic and the emphasis, and what
a comparison, a view and a group inspection read.

1. Read the code path and record each message with its evidence: who calls
   whom, from which function, in which order, and which messages come back.
   List the participants in reading order and each message in sequence with
   its kind: `sync` (a call, the default), `return`, `async` (fire and
   forget), `self` (a participant's own step; exactly when `from` and `to` are
   the same node). A call a participant makes on itself (`RequestContext.push`
   calling `self.match_request`, a loader trying its own candidates) is one
   `self` step on that participant: do not split a class the board draws as
   one part into method participants so the call becomes a message between two
   columns, since the exchange is between the parts the board has. Use `repeat` for a count the source fixes (a retry limit,
   a batch of a known size, a literal list of candidates tried in turn: two
   default module names is `repeat: 2`); a loop whose length depends on data
   is one step with a `note` that says so. Use `note` for a branch or a
   caveat. Walk the catalogue in `SKILL.md` for the rest: the parts outside the checkout
   are `external`; the relationships on the exchange's forward path carry
   `traffic`, and its returns, teardown, error branches and one-shot startup
   calls do not; and an ordering the reader must understand gets a
   walkthrough beat. A beat explains a step by naming it: give that step an
   `as` handle in the same write, put the handle in the beat's `subjects`
   with the parts it joins, and set the beat's `view` to the data-flow view
   so the reader looks at the exchange while reading it.
2. Create a standalone sequence in one write. Against an existing board, use
   the same payload with `semantic edit` and the version you read. The
   evidence here, from `src/flask/cli.py` in Flask 3.0: `run_command` calls
   `ScriptInfo.load_app`; when `FLASK_APP` names nothing, `load_app` loops
   over the literal tuple `("wsgi.py", "app.py")`, a list the source fixes, so
   that step is `repeat: 2`, and within each candidate `locate_app` tries the
   attribute names, which the `note` says; `load_app` then returns the app to
   `run_command`, which hands it to werkzeug's `run_simple`. Each of those
   calls is an `edge` as well as a step.

```bash
archboard semantic new "Flask CLI startup" --doing "explaining how flask run starts the server" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "Shell", "kind": "external", "responsibility": "Invokes the flask command" },
    { "name": "FlaskGroup", "kind": "module", "responsibility": "Dispatches the selected Flask command",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "run_command", "kind": "function", "responsibility": "Loads the app and starts the development server",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "ScriptInfo", "kind": "module", "responsibility": "Locates and imports the Flask application",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "run_simple", "kind": "external", "responsibility": "Serves requests until interrupted" }
  ],
  "edges": [
    { "from": "Shell", "to": "FlaskGroup", "kind": "call", "label": "flask run" },
    { "from": "FlaskGroup", "to": "run_command", "kind": "call", "label": "invoke" },
    { "from": "run_command", "to": "ScriptInfo", "kind": "call", "label": "load_app" },
    { "from": "run_command", "to": "run_simple", "kind": "call", "label": "serve", "emphasis": "hero" }
  ],
  "flows": [{
    "name": "flask run",
    "participants": ["Shell", "FlaskGroup", "run_command", "ScriptInfo", "run_simple"],
    "steps": [
      { "from": "Shell", "to": "FlaskGroup", "label": "flask run" },
      { "from": "FlaskGroup", "to": "run_command", "label": "invoke" },
      { "from": "run_command", "to": "ScriptInfo", "label": "load_app" },
      { "as": "load", "from": "ScriptInfo", "to": "ScriptInfo", "label": "import the first candidate that loads", "kind": "self", "repeat": 2, "note": "tries wsgi.py then app.py unless FLASK_APP names the app or factory; within each, locate_app tries the attribute names" },
      { "from": "ScriptInfo", "to": "run_command", "label": "Flask app", "kind": "return" },
      { "from": "run_command", "to": "run_simple", "label": "serve" }
    ]
  }],
  "views": [{ "name": "Startup exchange", "grammar": "data-flow", "scope": { "kind": "selection", "flows": ["flask run"] } }],
  "walkthroughs": [{
    "name": "Why the app is imported before serving",
    "beats": [{
      "heading": "Find the app once, then serve",
      "body": "run_simple receives an app ScriptInfo has already imported: the search over wsgi.py and app.py happens once at startup, never per request, which is why an import error stops the command before any socket opens.",
      "subjects": ["load", "ScriptInfo", "run_simple"],
      "view": "Startup exchange"
    }]
  }]
}
JSON
archboard semantic rasterize "Flask CLI startup" --view "Startup exchange" --out startup.png
```

3. Check the answer's flow against your record: participants in the order you
   meant, steps in the order the source runs them, returns where the source
   returns, kinds and notes as the code justifies; the saved beat's `subjects`
   carry the step's minted id (a handle nobody referenced explains nothing).
   Open the picture through
   the `data-flow` view you made, not the whole board: the columns in order,
   every message readable and in sequence, returns and repeats
   distinguishable, nothing cut off. A picture the request names goes where
   it says; one you draw to look at goes in a temporary directory, never into
   the checkout you are describing. Your answer names the catalogue rows the
   board uses and the ones you judged not to apply.

Read [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md)
for view scopes (isolating one relationship, a region, the whole board), beat
subjects and identity, and single-participant flows.
