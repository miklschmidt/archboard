# Describe the architecture

## Give each container a job

Bind each container, a module with parts, to the directory that holds all its parts.
The binding also owns code that no part binds.
The code check includes calls into that code.

`archboard check` reports these binding warnings:

- `CONTAINER_UNBOUND`: a module has bound parts but no binding.
- `CONTAINER_PARTS_OUTSIDE`: a part binds code outside its container.
- `suggestedBinding`: the directory holds all parts and no other module's code.

If the warning supplies `suggestedBinding`, bind the container there.
Otherwise, read the source.
If a part belongs to another module, move it there.
If one responsibility spans several folders, tell the user which folders split it.
Recommend a layout that keeps each responsibility together.
Keep the model accurate until the code moves, then bind the container.

If a container has no bound parts, use relationships or flows to show its responsibility.
If neither gives it a responsibility, move its parts to its parent.
Remove the empty container.
For a label that only gathers parts, use a configured group.
Connect each root to another root, or move it into the module that uses it.

Start each call at the part that makes it.
End each relationship at the deepest modeled part that owns it.
Containers need entry-point parts for their relationships.
Nesting already shows containment, so an open module draws no line to its own part.

`RELATIONSHIP_ON_CONTAINER` fails the semantic check when a relationship ends on a container.
A relationship to a contained part is the exception.
It produces `CONTAINER_LINE_TO_OWN_PART`.

To repair an endpoint, read the source at its evidence anchor.
Move the endpoint to the part that owns that code.
Preserve the relationship identity.
Do not copy it to other parts.
If no part owns the responsibility, add a part that names it.
Add parts only for boundaries that callers name and architects need to see.
A part for each file turns the model into an import map.

If two parts do different jobs across a boundary, state two relationships.
One relationship represents the other calls across the same boundary.
`RELATIONSHIP_UNDRAWN` reports those calls as information.

The check also reports `CONTAINER_PASS_THROUGH` and `ROOT_UNCONNECTED`.
Read the source before repairing any reported shape.
Writes accept these shapes, but semantic checks report them.

## Fix the map from the code

A proposal states the architecture that you want. The current state maps the code as it is.
In the current state, the code is the source of truth. If the map is wrong, fix the map.
A module, relationship or flow step in the current state that the code does not hold is a defect. Remove it, or correct it to what the code does.
A part that only a proposal holds is a plan, not a defect, until that proposal is adopted.
If two modules describe the same code, read that code. It answers whether they are one module, so do not ask the user.
A matching binding or name only raises the question.
If they are one module, keep the identity of the module that sits where the code sits.
In one intent, move every relationship, flow step and walkthrough reference onto it, and remove the other module.
Tell the user what you merged and which code proved it.

## Say what each flow does

Every flow has a `summary`: one or two plain sentences that say what the exchange does and why it matters.
Read the code that the flow names, and do not repeat its name.
`add-flow` requires it, and no edit clears it.
A write that changes a flow with no summary refuses with `FLOW_SUMMARY_REQUIRED`.
Add an `edit-flow` change with `set.summary` to the same intent.
`archboard check` reports each current flow with no summary as the error `FLOW_SUMMARY_MISSING`.
A reader can still read that model, and a write that leaves the flow alone still succeeds.
Retained readings keep their exact original content.

## Say what each proposal changes

Name a proposal for what it changes, for example `Workbench Stop ends a workhorse's whole work tree`.
A task ID in a name means nothing to the reader. Put it in the task plan.
Give every proposal a `summary`: one sentence that states the change and why it matters.
If two proposals change similar parts, write names that tell them apart.
Rename a proposal through `proposal.set`. Its former names stay on the state.
In every reply, question, PR body and task note, call each proposal and state by its name.
For example, write "Painting owns the paint directory" or "the current state".
Keep the state ID for commands and requests. If the reader must type it, give it in a code span after the name.

## Keep authoring safe

Follow [canonical models](canonical-models.md) for discovery, claims, writes, identity allocation, and proposal operations.
A name, code binding, or similar responsibility never establishes shared identity.
Keep independent proposals separate even when their names match.

Adopt or shelve only when the owner authorizes that outcome.
A request to prepare an implementing PR authorizes adoption on that branch.
A source merge never adopts architecture.
If a claim is revoked, stop that intent and report the state that it left.

## Select the evidence

Architecture shows parts and continuing dependencies.
Sequence shows the order of one authored exchange.
Flowchart shows that exchange's decisions and loops.
Use an explicit flow for behavioral diagrams.
Never infer execution order from structural relationships.

Use `model read --code` for a selected module's exact local source.
Use `check code` for bindings, evidence anchors, relationships, and interfaces.
A retained reading never substitutes current source for unavailable historical evidence.

Follow the [render and embed recipe](canonical-models.md#initialize-and-consume-one-live-model) for SVG and PNG.
Use `check embeds --fix` only when the request authorizes artifact replacement.
If a diagram misdraws correct saved meaning, fix the renderer.
Never change architecture or add geometry to repair placement.

Before answering a screen question, run `browser panes`.
Follow the [explanation recipe](canonical-models.md#temporary-explanations) with its captured reading.
Keep the model, revision, subjects, reading intent, state, checkpoint, and comparison base together.
Later navigation must not retarget an explanation.
