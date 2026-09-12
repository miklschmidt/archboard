# Architecture work with a person

Supplement to `SKILL.md` for building, exploring and refactoring **codebase
architecture** with a human, typically reading on a large screen.

`SKILL.md` covers authoring first, then the separate live-browser branch. This
file covers the loop a person and an agent run when somebody is actually
reading.

## What makes this different from drawing a diagram

A diagram is output. A board is an argument about a system, and a proposal is
an argument about changing it. The person reads; you state. Their contribution
is not a rearrangement — there is nothing to rearrange — it is what they pick
out, what they ask about it, and which proposal they adopt.

So the loop is: **state → render → they read → they ask → propose.**

Begin every turn with the board name. Authoring, reading, comparing and
rendering need no browser at all. If somebody is reading in a browser, what they
have picked out reaches you as part of your context: the ids are the same ids an
edit command takes, so "what does this do?" is answerable and "change this" is
actionable without asking them to describe what they mean.

## Reading back what somebody is looking at

You are told which board and variant a pane is showing, which named view it is
read through, and which subjects are picked out. Two things follow:

- **Answer about the thing they picked**, not about the board. A question asked
  with three nodes selected is a question about those three.
- **Propose against the variant they are reading.** Somebody looking at a
  proposal who says "add the cache" means add it to the proposal.

If nothing is picked out, say what you are about to change before changing it.
A board with forty nodes has forty things "this" could mean.

## Levels and drill-down

A level says which abstraction a board discusses. Choose `system` for systems
and their relationships, `service` for the collaborating services inside one,
and `module` for the code modules inside a service. Kind says what a node IS (a
queue); level says at what altitude it is being discussed.

A part whose internals deserve their own coherent board gets one — a separate
board, not a variant. A variant is another state of the _same_ subject; a
drill-down is a different subject at a lower altitude. Link to an internals
board that already exists rather than making a second one about the same thing.

## Nodes carry the code binding

A node states the code that implements it as part of what it is:

```json
{
	"name": "Orders",
	"kind": "service",
	"binding": { "repo": "github.com/acme/payments-api", "path": "src/orders.ts" }
}
```

Register each checkout once with `archboard repo add <path>`. The board stores
the repository identity and a repo-relative path — never an absolute path — so
the same board opens the right file on anybody's machine. Somebody reading the
board can open the code from the node, which is most of what makes a board worth
keeping current.

Bind the node that _is_ the thing. A binding on a container that points at one
of its children's files is worse than no binding: it sends every reader to the
wrong place, confidently.

## Proposals

Branch, then change only what the proposal changes. Subject identity is what
makes a comparison possible, and a board restated from scratch shares none: the
difference comes back as "everything removed, everything added".

Editing a variant carries the edit into every draft derived from it, in the same
write. A draft that cannot take the change cleanly holds what it disagrees
about, and a draft below an unsettled one waits rather than guessing which side
to build on. Read `semantic show` before assuming a branch is ready: a draft with
a standing reconciliation is waiting for a person, not for you.

Adopting a proposal makes it current and leaves what was current as a historical
variant under its own name. That record is most of the point — "this is what we
ran until March, and this is why we stopped" is a question boards get asked far
more often than "what does it look like now".

## Drawing an architecture pass

Work from what is true rather than from what will look tidy:

1. **Name the parts that exist**, with the kind each one actually is. `external`
   for anything outside the system; `other` only when the vocabulary genuinely
   has no word, and often when it does that means the board is at the wrong
   level.
2. **State containment** with `parent`. Containment is ownership, not proximity.
3. **Wire them** with the kind of reach each relationship is. A label only when
   the kind does not already say what crosses.
4. **Mark at most a couple of edges `hero`.** An author who marks everything a
   hero has marked nothing.
5. **Add a flow** when the order of an exchange is the thing being discussed,
   and a view when one reading of the board deserves its own name.

Then render it and look. If the picture is hard to read, the fix is almost never
a presentation one: it is usually a board trying to say two things at once, and
the answer is a second board at a lower level.

## Anti-patterns

- Restating a board from scratch to make a proposal. It destroys the identities
  a comparison joins on.
- Answering about the board when somebody has something picked out.
- Binding a container to one of its children's files.
- Adopting a proposal that still holds an unsettled reconciliation. Somebody has
  to settle it; adopting it decides it by forgetting.
- Treating a rendered picture as the deliverable. The board is kept; the picture
  is derived and can be drawn again any time.
