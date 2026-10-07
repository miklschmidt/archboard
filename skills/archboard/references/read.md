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
3. For which parts of a module its callers reach, run
   `archboard semantic inspect <board> --container <node> [--variant <name>]`
   with the node's id or name. It reports the interface of a node that has
   children, over the whole variant. The interface comes from the board's
   relationships, not from the code. An entry point is a child that a
   relationship from outside the container reaches, on the child or on a part
   inside it. A hidden part is a child that no such relationship reaches. The
   answer also lists:
   - the callers, the parts outside where those relationships start, each
     counted once
   - the outgoing relationships, from inside the container to outside it
   - the relationships that end on the container itself
   - the pass-through entry points

   Every kind of relationship counts. Flow steps do not count. Report these as
   the board states them, with these cautions:
   - A node with no children answers that it holds no parts. Say that, not
     "no entry points".
   - A container with no callers has only hidden parts. Say that the board
     draws no caller of it, not that its interface is small.
   - A relationship that ends on the container itself makes its source a
     caller and makes no entry point, because the board names no part of the
     module that the source uses. Report it as that, not as a fault.
   - A pass-through entry point has no children and sends exactly one
     relationship, of the same kind as every relationship it receives. It is a
     question for the reader (does deleting it lose only a line?), never a
     fault. The counts never say that a module is deep or shallow.

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
   removal beside an addition. The answer starts with the interface section,
   `interfaceChanges`. It lists each container whose interface moved. For
   each, it names the entry points added and removed, the children that
   became entry points or hidden parts, and the callers gained and lost.
   Report those first. They set no `standing`.
   `interfaceMeasures` gives the five counts of each container on each variant
   read. Each `--beside <id|name>` adds one more variant, such as a competing
   proposal. Report the counts side by side as the answer gives them. Never
   rank the variants by them.
5. For where a board's code changes most often (which parts churn, what to
   look at first in a refactor, whether the board's busiest parts are the ones
   it draws as central), or which parts change together, run
   `archboard semantic locality <board> [--variant <name>] [--since <date>]`.
   It reads Git through each part's `binding`. A symbol narrows attribution
   to its declaration through the available language adapter. `attribution`
   reports `symbol`, `path`, or `mixed`, with fallback reasons and commit ids.
   Report path-wide fallback when precise attribution is unavailable.
   `hotspots` ranks every part it read by the number of commits that changed
   those files, most commits first. Each part lists its commits, newest
   first, and `commits` holds their subjects and times. It reads the
   current variant, or the draft that `--variant` names. The period is the
   year before the commit time of each checkout's HEAD, so one HEAD gives one
   answer. `--since` names another start, and `periods` says what was read.
   Report it with these cautions:
   - A hotspot counts commits, not changed lines and not the complexity of the
     code. Say that a part changes often, never that it is bad.
   - `leftOut.largeCommits` counts the commits of more than 30 files that no
     count includes, because a bulk change says nothing about one part.
     Report the number beside the ranking.
   - A part in `skipped` was not read. Its `reason` says why, such as no
     binding or no checkout of its repository on this machine. Name it as not
     read, never as a part that no commit changed. A part with `count: 0` was
     read and had no commit in the period.
   - Bindings without symbols count the whole path. Compare containers at one
     level. Distinct symbols in one file count only their own declaration
     changes. Shared Terraform definitions count for every bound module instance.
   - The ranking describes the code, not the board: it says nothing about
     whether the board is right. Change nothing because of it.

   `coupling` lists pairs of parts that changed together: at least 5 shared
   commits, and a `degree` of at least 30%, which is the shared commits over
   the mean of the two parts' own counts. The thresholds are fixed. Each pair
   names its two `subjects` and its shared `commits`. Report it with these
   cautions:
   - A pair with `unjoined: true` has no relationship or flow step between
     the two parts, between their containers, or between parts inside them,
     and neither part holds the other. It asks a question: does the board miss
     a dependency (a call, an import, a shared data format), or does one
     decision live in both parts? Read the subjects of the shared commits
     before you say which, and say it as a question, never as a fault.
   - A pair with `unjoined: false` changes together along a dependency the
     board already draws. That is expected, and it is not a finding.
   - Duplicate declaration ownership cannot pair. Distinct resolved symbols
     can pair even within one file. Path-wide readings exclude overlapping
     paths. Large commits and parts in `skipped` never form a pair.
   - Coupling describes the code, like the ranking. Change nothing because of
     it.

6. Answer from what the CLI printed, naming subjects as the board names them:
   members with their containers, internal relationships, boundary
   relationships as incoming or outgoing, neighbours, a container's entry
   points, hidden parts, callers and outgoing relationships, the ranked
   hotspots with the large commits left out, the coupled pairs with each
   unjoined pair as a question, and anything the question asked
   about that the board does not say. Do not read the vault
   file, and do not write: a question is not a request to repair the board,
   and a contradiction between the board and the source is reported, not
   fixed, unless the request asks for the change.

Read [authoring](authoring.md) for what groups, bindings and
drill-down mean when the answer turns on them.
