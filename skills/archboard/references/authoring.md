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

## Map a codebase from scratch

Inspect the active vocabulary and registered checkouts before authoring.

1. Run `archboard model config` and read `policy.nodeKinds`, `policy.relationshipKinds`, `policy.groups`, `policy.lenses`, and `policy.codeCheck` when present. Use the returned `configurationFile` to locate the vault's `.archboard/config.yaml`.
2. Run `archboard repo list` to confirm the repository identity (`repo`) for bindings and anchors. Register missing checkouts with `archboard repo add <directory>`.
3. Read the repository layout, entry points, manifests, and key boundaries before naming modules.

Start with the few root modules that explain the major responsibilities a new engineer needs to learn first.
Use the ownership boundaries that callers rely on to decide which files belong to each module.
Give every module a concise `name`, a one-line `responsibility` that fits its card, and a `description` only where boundaries or architectural decisions need more explanation.
Use `order` to give siblings a clear reading order.

A vault created by `archboard model init` starts with an empty planning model (`current: null`).
Build the first map by [creating a planning proposal](canonical-models.md#create-and-compare-compact-proposals).
Run `archboard check all --state <proposal-id>` to inspect its semantics and code evidence.
Keep the proposal unadopted unless the request authorizes adoption, following [proposal completion](canonical-models.md#complete-a-proposal).

### Module kinds, external, and groups

Pick `kind` from the vault's active `nodeKinds`.

Use `external` only for systems, services, or packages outside this repository's ownership boundary.
Leave an `external` module unbound except for vendored code inside a checkout Archboard reads.
When `check code` measures a bound `external` module or a part inside one, it reports depth counts and skips the general module-depth and unused-export findings.
Other checks, including Terraform-specific module findings, still apply.
Model an owned adapter, client wrapper, or port as an internal module and draw its relationship to the `external` target.

Use `groups` for cross-cutting concerns that span containment boundaries (for example a feature slice, compliance boundary, or runtime tier).
Define groups under `groups` in the vault's configuration file with a display name and palette color.
Set `groups` explicitly on each member. Canonical module files store the IDs once each in sorted order.

## Bind modules to code

Bind every owned, implemented module to the code that implements its responsibility using `repo`, `path`, and optional `symbol`.
Choose the binding granularity to match what the module owns:

- Bind a code container to the directory that holds its parts so the containment check can see their shared ownership. A leaf module can bind a directory or a recognized entry file such as `index.ts`, `__init__.py`, or `mod.rs` so `check code` can measure its interface and depth (`MODULE_SHALLOW` and export findings; see [module depth](design-lens.md#module-depth)).
- Bind a narrower part to a specific file or `symbol` when it owns one implementation inside a larger module.
- When `check code` reads a non-entry file or symbol binding, a measured module in the same model state and checkout whose directory contains that file covers it; otherwise `check code` skips depth measurement for that part with `binding-not-a-module`.

Use the registered repository identity in `repo` and the repository-relative location in `path`.
Use an empty `path` for the checkout root. When binding a Terraform symbol in a dotted directory, end the directory path with `/` so the containment check recognizes it.

## Author true relationships

Author every relationship on its source module. In `add-relationship`, use `source` and `relationship.to`. In module files, use `outgoing[].to`.
Follow the mechanism's direction, such as caller to callee, producer to queue or consumer, component to rendered child, or importer to declared dependency.

- If module A calls B and then C, author `A -> B` and `A -> C`.
- Keep answers back to callers in flow `return` messages.
- Keep `label` short (at most 60 characters), naming what the relationship carries or asks for.
- Add an `anchor` when it helps verify the relationship. Give `repo`, `path`, and `symbol` for the definition or use that proves it.
- Use `emphasis: hero` for the primary exchange and `emphasis: muted` for secondary connections. The default is `normal`.
- Set `traffic` when ongoing pulse motion clarifies the picture. Its `speed` and `volume` are illustrative.
- Put enduring architectural connections in relationships, and put step-by-step request ordering, branches, retries, and return messages in flows.

### Choose the kind and the effect

Set the `kind` for how the relationship travels and the `effect` for what it asks the target to do. A declared-only `dependency` omits `effect`.
The kind is the color of its line and the effect the decoration at its ends, and lenses select by both.
Read the sending code and the callee or its contract before you choose either.

Choose the kind by the mechanism at the two named ends:

| Kind         | The source                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `sync`       | Calls the target in its own process and has the answer when the call returns.                        |
| `async`      | Calls the target in its own process, and the call returns before the work is done.                   |
| `http`       | Sends the target an HTTP request.                                                                    |
| `rpc`        | Calls the target through a remote procedure contract, such as gRPC or JSON-RPC.                      |
| `event`      | Publishes a named message that the target receives.                                                  |
| `queue`      | Puts work on a queue that the target works off.                                                      |
| `stream`     | Sends or receives successive bytes or records with no message name: a pipe, a stream, a media track. |
| `spawn`      | Starts the target as a process.                                                                      |
| `render`     | Places the target's component in its output.                                                         |
| `storage`    | Reads or writes through a store's own interface: files, SQL, keys or objects.                        |
| `dependency` | Declares a requirement, such as a type-only import, a package or a build.                            |

Take the most specific contract that the source relies on.
When none of these says how a relationship travels, consider a kind of the vault's own.
JSON-RPC over HTTP is `rpc`.
A service that asks a repository object for orders is `sync` or `async`, and the repository that issues the SQL is `storage`.
Use `sync` or `async` for a function or value that the source uses within the same process when no more specific kind applies.
`call` is gone: the configuration, a lens and `--hide-kind` refuse it.

#### Sync or async

Read the call at the anchor, the source's call into the target, and its callee:

- `async` when the source awaits it (`await`, `.await`, `.then`, or it hands the promise or future on to its own awaiting caller).
- `async` when the source starts it and leaves it to run: a task, a goroutine, a thread, `spawn`, `spawn_blocking`, `create_task`, `Task.Run`, `Task {}`, `dispatch_async`, `pthread_create`, a timer, or an async function called without being awaited.
- `sync` for a plain call of a function that is not async, and for a value the source reads.

Judge the call into the target, not the source's own signature: an async function that makes plain calls into the target is `sync` for those calls.
Registering a callback is `sync` when the registering call returns at once; the later calls of the callback are the target's own relationship.
A relationship that stands for several calls takes the timing of the operation its label names.

The code facts already say how each call site runs its callee, where the language can tell: TypeScript, Rust, Python, C#, Swift, Go, Objective-C and C.
`check code` reports `CALL_TIMING_MISMATCH`, as information, on a `sync` relationship whose anchored calls are all awaited or started, and on an `async` one whose anchored calls are all plain.
Read the call, then correct the kind, or move the anchor to the call the relationship stands for.
The check leaves the decision to your source reading when both plain and asynchronous calls match the anchor or when any matching call has unknown timing.

A reader reads the kind with the effect: a `sync` `compute` is where a caller waits for an answer it could have asked for in the background, and the `Sync compute` lens shows those.
Never choose a kind to make a picture look better.

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
| A read through a cache, or one that fills a memo of a fixed value | `sync`       | `query`    |
| An awaited write that invalidates what other callers read         | `async`      | `mutation` |
| A function that formats the bytes that it is given                | `sync`       | `compute`  |
| A task started to refresh an index, left to run                   | `async`      | `mutation` |
| A component that places a child component with no mount behavior  | `render`     | `compute`  |
| An event publication                                              | `event`      | `mutation` |
| A queue submission                                                | `queue`      | `mutation` |
| A read of retained events that consumes none                      | `event`      | `query`    |
| A short-lived process that lays out the graph that it is given    | `spawn`      | `compute`  |
| A Git command that reads a ref                                    | `spawn`      | `query`    |
| The start of a server that outlives the request                   | `spawn`      | `mutation` |
| A type-only import                                                | `dependency` | none       |

When the code does not rule a side effect out, write `mutation` and name the gap in your report.
A relationship that stands for several operations takes the strongest effect: `mutation`, then `query`, then `compute`.
Omit the effect for a declared-only `dependency`.
When loading the target performs work such as registration on import, state that effect. If the source calls into the target, name the call's mechanism and effect. `check code` reports `DEPENDENCY_CALLED` when it finds call evidence for a `dependency`.

Add a kind of the vault's own when several relationships travel by one mechanism of this repository's domain that no built-in kind names, such as starting a durable workflow.
A kind earns its place when a reader of the picture would act on it and the code decides it.
Do not add one for the role of the target, such as a cache or a logger: that belongs on the card.
Do not add one to split `sync` by what the call does: that is the effect.
Define it under `relationshipKinds` in the vault's configuration file with a name, a color from the palette, and the evidence kinds that prove it.

```yaml
relationshipKinds:
  workflow: { name: Workflow, color: teal, evidence: [call, configured-path] }
```

Its color is required, because the kind is the color of its lines.
Choose a color that no other kind of the vault uses. The kind sets nothing else of the line: the effect draws its ends.
Relationships of the vault's own kind state an effect too.
An entry with a built-in id replaces that kind whole.
`archboard model schema vault-config` prints the fields and the colors.

Done: every relationship that you author or touch names the kind whose row matches its code, and the effect that the three questions give.

### Evidence kinds and check code

Read `policy.relationshipKinds` from `archboard model config` for the `evidence` lists that `archboard check code` uses.
A kind without an `evidence` list accepts every evidence kind.
`DEPENDENCY_CALLED` reports runtime use even if the policy accepts `call` for `dependency`.

The six evidence kinds are:

- `call`: a runtime call, construction, value read, or component render in code.
- `configured-path`: an infrastructure-only link (such as a Kubernetes Service selecting a workload or a Terraform resource reference) or an environment variable read in bound code joined to the compose service, Kubernetes workload, or Terraform resource that supplies the target's address.
- `permission`: a declared access or IAM permission between parts.
- `import`: a source import without a runtime call (for example a type-only import; choose a kind that accepts `import`, such as `dependency` in the default policy).
- `build-dependency`: a package, workspace, or build-graph requirement.
- `provisioning`: infrastructure provisioning of one part by another.

An anchor can cite a symbol defined in the bound code of either end or one of its parts. It can also cite an infrastructure declaration that joins the ends. A listed Terraform join supports the anchor when one instance matches both ends under the provider's endpoint roles. An unlisted declaration supports the anchor when one instance reaches the bound code of both ends through its references. When the check can classify the cited use, one evidence kind on the relationship kind's list is enough.
For `ANCHOR_MISMATCH`, check the symbol's definition and how the file uses it. When the check rules out the bound code of both ends and their parts, a definition outside that code produces a warning and a declaration alone produces an information finding. If the mismatch is about evidence kind, any resolved use makes it a warning and candidate uses alone make it information.

For an unanchored relationship, `RELATIONSHIP_BACKWARDS` means accepted evidence runs only in the opposite direction, and `RELATIONSHIP_UNSUPPORTED` means no accepted evidence joins its ends. Read the source to correct the relationship or cite the code that proves it.
For `RELATIONSHIP_UNDRAWN`, read the reported calls, configured paths, or build dependencies and draw the relationships that belong in the model. A finding groups evidence by the part it reaches. It warns when at least one resolved use crosses an unconnected boundary and otherwise reports information.

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
Nesting already shows containment.
When one endpoint contains the other, semantic inspection reports `CONTAINER_LINE_TO_OWN_PART` as a warning.
For other relationships with a container at either end, it reports `RELATIONSHIP_ON_CONTAINER` as an error.

Before repairing any reported shape, read the source.
To repair an endpoint, read its source anchor.
Move the endpoint to the owning part without replacing or copying the relationship identity.
If no part owns that responsibility, add a part for it.
Model boundaries that callers name and architects need, not a part for every file.

If two parts perform different jobs across a boundary, state two relationships.
State each relationship once. `RELATIONSHIP_REPEATED` warns when two relationships have the same source, target, and explicit anchor. Keep the one whose kind, effect, and label say what the code does.
For `RELATIONSHIP_UNDRAWN`, the check finds the two sides at the children of the nearest shared container, or at separate roots. A relationship or flow message joining any parts on those sides counts as a connection across that boundary.

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

Read the sending code for each message, including messages inside decisions and loops. Cite its `repo`, file `path`, and `symbol` in the message's `anchor` when source exists.
List `participants` in left-to-right reading order as the sequence columns should appear.
Choose the step form that matches the exchange.

- Use the message kind `sync` (default) when the sender waits for an answer, including for an awaited request. Use `async` when it sends the message and continues.
- Use `self` for a self-call, with the same module at both ends.
- Set `repeat` to the exact count when a message runs two or more times, such as a known batch size.
- Use `loop` with a `condition` for steps that repeat together or a count that depends on data.
- Use `decision` with a `question` and at least two uniquely labeled `alternatives`. Include a step in at least one alternative.
- Use `return` for an answer to the caller.

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
