# Describe the architecture

## Map the code

Current describes implemented code. A proposal describes intended architecture.
Before describing Current, read the bound source, imports, callers, and external contracts.
Correct or remove current modules, relationships, and steps that the code does not support.
Unbuilt proposal subjects remain plans until adoption.

If two modules describe the same code, read it to decide whether they represent one responsibility.
Resolve that question from source without asking the user.
Matching names or bindings raise the question but do not answer it.
`archboard check` warns with `BINDING_SHARED` when a module binds the same code as another.
If they represent one module, keep the identity located with that code.
In one intent, move relationships, flow steps, and walkthrough references to it, then remove the duplicate.
Tell the user which modules you combined and which code proved the match.

### Choose the kind and the effect

Every relationship states its `kind`, how it travels between its two ends, and its `effect`, what it asks the target to do.
The kind is the color of its line and the effect its line type, and lenses select by both.
Read the sending code and the callee or its contract before you choose either.

Choose the kind by the mechanism at the two named ends:

| Kind         | The source                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `call`       | Uses a function, a method or a value of the target in its own process.                               |
| `http`       | Sends the target an HTTP request.                                                                    |
| `rpc`        | Calls the target through a remote procedure contract, such as gRPC or JSON-RPC.                      |
| `event`      | Publishes a named message that the target receives.                                                  |
| `queue`      | Puts work on a queue that the target works off.                                                      |
| `stream`     | Sends or receives successive bytes or records with no message name: a pipe, a stream, a media track. |
| `spawn`      | Starts the target as a process.                                                                      |
| `render`     | Places the target's component in its output.                                                         |
| `storage`    | Reads or writes through a store's own interface: files, SQL, keys or objects.                        |
| `dependency` | Declares a requirement and runs nothing of the target: a type-only import, a package or a build.     |
| `other`      | Relies on the target in a way that no kind names. Say how in the label.                              |

Take the most specific contract that the source relies on.
JSON-RPC over HTTP is `rpc`.
A service that asks a repository object for orders is a `call`, and the repository that issues the SQL is `storage`.
A function or a value that the source uses at run time is a `call`, never a `dependency`.

Choose the effect by asking in order:

1. Can the operation have a side effect? Write `mutation`.
   A conditional write, a publication, an acknowledgement that removes work and installing a subscription are side effects.
   Follow work that the target delegates. A return value does not make a write a read.
   A side effect is a change that someone else can observe. Bookkeeping that leaves every answer the same is none: a memo or cache of a value that never changes, a lazy start of a server, worker pool or language server that serves the request, a one-time warning or other diagnostic output, and a component's own state and timers.
2. Otherwise, does it read held or fetched state, such as a store, the clock or a context? Write `query`.
3. Otherwise, the answer follows from what the source hands over alone. Write `compute`.

Judge every kind by its operation, as these examples do:

| Code                                                              | Kind         | Effect     |
| ----------------------------------------------------------------- | ------------ | ---------- |
| A POST that creates an order                                      | `http`       | `mutation` |
| A read through a cache, or one that fills a memo of a fixed value | `call`       | `query`    |
| A call that invalidates or rewrites what other callers read       | `call`       | `mutation` |
| A function that formats the bytes that it is given                | `call`       | `compute`  |
| A component that places a child component with no mount behavior  | `render`     | `compute`  |
| An event publication or a queue submission                        | `event`      | `mutation` |
| A read of retained events that consumes none                      | `event`      | `query`    |
| A short-lived process that lays out the graph that it is given    | `spawn`      | `compute`  |
| A Git command that reads a ref                                    | `spawn`      | `query`    |
| The start of a server that outlives the request                   | `spawn`      | `mutation` |
| A type-only import                                                | `dependency` | none       |

When the code does not rule a side effect out, write `mutation` and name the gap in your report.
A relationship that stands for several operations takes the strongest effect: `mutation`, then `query`, then `compute`.
A `dependency` states no effect, which says that it is a declared requirement only.
Give it one only when loading the target does the work that the relationship stands for, such as a registration on import.
`check code` reports a dependency whose evidence is a call into the target, so that you state the call and its effect.

Add a kind of the vault's own when several relationships travel by one mechanism of this repository's domain that no built-in kind names, such as starting a durable workflow.
Define it under `relationshipKinds` in `.archboard/config.yaml`, with a name, a color from the palette, an arrowhead and the evidence kinds that prove it:

```yaml
relationshipKinds:
  workflow: { name: Workflow, color: violet, arrowhead: filled, evidence: [call, configured-path] }
```

Its color is required, because the kind is the color of its lines.
Relationships of the vault's own kind state an effect too.
An entry with a built-in id replaces that kind whole.
`archboard model schema vault-config` prints the fields and the colors.

Done: every relationship that you author or touch names the kind whose row matches its code, and the effect that the three questions give.

## Give each container a job

A container is a module with parts.
For a code container, bind it to the directory that holds all its parts.
Its binding also owns code that no part binds. Code inspection includes calls into that code.
`archboard check` reports:

- `CONTAINER_UNBOUND`: Bound parts have no bound container.
- `CONTAINER_PARTS_OUTSIDE`: A part binds code outside its container.
- `suggestedBinding`: A directory contains all parts and no other module's code.

A runner is an infrastructure declaration that runs code.
Bind a deployed service to its runner.
Draw the code that it runs as parts.
This lets a call through infrastructure reach those parts.

An infrastructure binding names a declaration, not a source directory.
Its parts can bind code in any directory or repository.
The containment check reports neither warning for that container.
It still checks code containers inside it.

The exception uses these stated paths and symbols:

- Kubernetes: A YAML file with a `Kind/name` symbol, including objects such as ConfigMap and Secret.
- Compose: `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, or one of their `.override` files, with a service symbol such as `services.web`.
- Terraform and OpenTofu: A `.tf` or `.tofu` file or root module directory with a resource, data, or module-call address.
  Nested modules and instance keys, such as `module.api[0].aws_lambda_function.web["blue"]`, receive the exception too.

If a directory name contains a dot, end its path with `/`.
In a directory, a code symbol such as `order_service.start` has the same form as a Terraform address.
Bind its code file to distinguish it.
Recognition reads no files and does not prove that a declaration runs code.
Use `check code` to inspect source evidence.

If supplied, use `suggestedBinding`.
Otherwise, read the source before changing containment.
Move a misplaced part to the module that owns it.
If one responsibility spans folders, name them and recommend a layout that keeps that responsibility together.
Keep the model accurate until the code moves, then bind the container.

For a container without bound parts, show its responsibility through relationships or flows.
If neither gives it a job, move its parts to its parent and remove it.
For a label that only gathers parts, use a configured group.
Connect every root to another root, or move it into the module that uses it.

Start each relationship at the calling part and end it at the deepest modeled part that owns the receiving code.
Containers need entry-point parts for their connections.
Nesting already shows containment. An open module draws no line to its own part.
`RELATIONSHIP_ON_CONTAINER` fails semantic inspection when a relationship ends on a container.
A relationship to its own contained part instead produces `CONTAINER_LINE_TO_OWN_PART`.

Before repairing any reported shape, read the source.
To repair an endpoint, read its source anchor.
Move the endpoint to the owning part without replacing or copying the relationship identity.
If no part owns that responsibility, add a part for it.
Model boundaries that callers name and architects need, not a part for every file.

If two parts perform different jobs across a boundary, state two relationships.
State each relationship once. `RELATIONSHIP_REPEATED` warns on a relationship with the same ends and anchor as another. Keep the one whose kind, effect and label say what the code does.
One relationship represents other calls across the same boundary.
`RELATIONSHIP_UNDRAWN` reports those calls as information.

`CONTAINER_PASS_THROUGH` and `ROOT_UNCONNECTED` also identify shapes to inspect against source.
Writes accept these shapes. Semantic inspection reports them.
Use `check code` for bindings, anchors, relationships, and interfaces.

## Say what each flow does

Give every flow a `summary`: one or two sentences on what the exchange does and why it matters.
Read its code and explain more than its name.
`add-flow` requires a summary, and edits cannot clear it.

`FLOW_SUMMARY_REQUIRED` refuses a write that changes a flow without one.
Add `edit-flow` with `set.summary` for each named flow in the same intent.
`FLOW_SUMMARY_MISSING` is an `archboard check` error for each current flow without a summary.
Reads and writes that leave that flow alone still work. Retained readings keep their original content.

For each step, read the sending code and put its file and symbol in `anchor`.
Read that source again for behavior that the first pass missed.
Use these step forms:

- Use `self` for a self-call, with the same module at both ends.
- Use `repeat` for a fixed count, such as retries or a known batch size. A note cannot replace it.
- Use `loop` for repetition that depends on data.
- Use `decision` for a branch.
- Keep returns as messages without adding reverse structural relationships.

## Say what each proposal changes

Name a proposal for its change, for example `Queued requests survive worker restarts`.
Put task IDs in the task plan, not the proposal name.
Give it a one-sentence `summary` that states the change and its reason.
Distinguish proposals that affect similar parts through their names.
Rename through `proposal.set`. Former names remain selectable.

Use proposal and state names in replies, questions, PR bodies, and task notes.
Keep IDs for commands and requests.
If a reader must type an ID, put it in a code span after the name.
For lifecycle authorization, follow [proposal completion](canonical-models.md#complete-a-proposal).
For operations, claims, and identity rules, follow [canonical models](canonical-models.md).
