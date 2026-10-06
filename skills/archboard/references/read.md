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
2. For a configured group,
   `archboard semantic inspect <board> --group <id> [--variant <name>]` reports,
   over the whole variant: the members, the relationships between them, the
   relationships crossing the boundary with their direction, and the immediate
   neighbours outside. A member a view hides is still a member; to say which
   members a view leaves undrawn, read that view's `scope` from step 1 against
   the inspection's member list.
3. For what a module exposes to the rest of the system,
   `archboard semantic inspect <board> --container <node> [--variant <name>]`
   (the node by id or name) reports the interface of a node that has children,
   over the whole variant. Its entry points are the children that a
   relationship from outside the container reaches, at any depth below the
   child; its hidden parts are the children that none reaches. Also reported:
   the callers (the parts outside, each counted once), the outgoing
   relationships (starting inside and ending outside), the relationships that
   end on the container itself, and the pass-through entry points. Every kind
   of relationship counts; flow steps do not. Report these as the board states
   them, with these cautions:
   - A node with no children answers that it holds no parts. Say that, not
     "no entry points".
   - A container with no callers has only hidden parts. Say that the board
     draws no caller of it, not that its interface is small.
   - A relationship that ends on the container itself makes its source a
     caller and makes no entry point: the board names no part of the module
     that source uses. Report it as that, not as a fault.
   - A pass-through entry point has no children, sends one relationship, and
     sends the kind it receives. It is a question for the reader (would
     deleting it lose only a line?), never a fault, and the counts are never a
     verdict that a module is deep or shallow.
4. For what one variant changed,
   `archboard semantic compare <board> [--variant <id|name>]` reads it against
   the current variant (on a board nobody has built, the variant it came from),
   as its picture is drawn: every part, relationship, sequence, step,
   walkthrough and beat either state has, each `added`, `removed`, `changed` or
   `unchanged`, with the fields that moved for a change and the endpoints a
   relationship or step now lands on. The current variant, and a first draft
   on a board nobody has built, have nothing to be read against and are
   refused unless `--against <id|name>` names a variant. Report a
   relationship whose end moved as one relationship that moved, not as a
   removal beside an addition.
5. Answer from what the CLI printed, naming subjects as the board names them:
   members with their containers, internal relationships, boundary
   relationships as incoming or outgoing, neighbours, a container's entry
   points, hidden parts, callers and outgoing relationships, and anything the
   question asked about that the board does not say. Do not read the vault
   file, and do not write: a question is not a request to repair the board,
   and a contradiction between the board and the source is reported, not
   fixed, unless the request asks for the change.

Read [authoring](references/authoring.md) for what groups, bindings and
drill-down mean when the answer turns on them.
