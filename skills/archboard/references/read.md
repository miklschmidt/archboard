# Answer a question from a saved board

The recipe for a question a board already answers: read the saved meaning
through the CLI, report it in the board's own terms, and change nothing.

1. `archboard semantic show <board>` prints the whole family: every variant
   with its `lifecycle`, its `content` (nodes with `parent`, `groups` and
   `binding`; edges with `from`, `to`, `kind`; flows, views, walkthroughs) and
   the board `version`. Read the variant the question is about; the current
   one when it names none. A view's `scope` says what that view draws: a
   selection of nodes draws those and their containers, a selection of flows
   draws the exchange, and a part a view does not select is not drawn there,
   however real its membership elsewhere.
2. For a configured group, `archboard semantic inspect <board> --group <id>
[--variant <name>]` reports, over the whole variant: the members, the
   relationships between them, the relationships crossing the boundary with
   their direction, and the immediate neighbours outside. A member a view
   hides is still a member; to say which members a view leaves undrawn, read
   that view's `scope` from step 1 against the inspection's member list.
3. Answer from what the CLI printed, naming subjects as the board names them:
   members with their containers, internal relationships, boundary
   relationships as incoming or outgoing, neighbours, and anything the
   question asked about that the board does not say. Do not read the vault
   file, and do not write: a question is not a request to repair the board,
   and a contradiction between the board and the source is reported, not
   fixed, unless the request asks for the change.

Read [authoring](references/authoring.md) for what groups, bindings and
drill-down mean when the answer turns on them.
