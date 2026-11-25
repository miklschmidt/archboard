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

Before authoring modules or relationships, inspect the vault's active vocabulary and registered checkouts:

1. Run `archboard model config` to read the active `nodeKinds`, `relationshipKinds` (with their evidence lists), `groups`, `lenses`, and `codeCheck` rules.
2. Run `archboard repo list` to confirm the repository identity (`repo`) to use in bindings and anchors. Register missing checkouts with `archboard repo add`.
3. Read the repository layout, entry points, manifests, and key boundaries before naming modules.

Start with five to nine root modules that explain the major responsibilities a new engineer needs to learn first.
Model real ownership boundaries that callers use and architects reason about, not one module per file or thin directory mirror.
Give every module a concise `name`, a one-line `responsibility` that fits its card, and a `description` only where boundaries or architectural decisions need more explanation.
Use `order` to give siblings a clear reading order.

A vault created by `archboard model init` starts with an empty planning model (`current: null`).
Author the first map in a planning proposal, then inspect it with `archboard check semantics --state <proposal-id>` and `archboard check code --state <proposal-id>`.
Keep the proposal unadopted unless the request authorizes adoption, following [proposal completion](canonical-models.md#complete-a-proposal).

### Module kinds, external, and groups

Pick `kind` from the vault's active `nodeKinds` (by default: `system`, `service`, `app`, `module`, `function`, `route`, `job`, `queue`, `datastore`, `cache`, `external`, `ui`, `config`, `test`, `package`, `other`).

Use `external` only for systems, services, or packages outside this repository's ownership boundary.
Leave an `external` module unbound except for vendored code inside a checkout Archboard reads.
A bound `external` module keeps its depth counts in `check code` without triggering export or shallow-module findings.
Do not mark an internal adapter, client wrapper, or port as `external`: that module is an owned door that talks to the `external` target.

Use `groups` for cross-cutting concerns that span containment boundaries (for example a feature slice, compliance boundary, or runtime tier).
Define groups under `groups` in `.archboard/config.yaml` with a display name and palette color.
State `groups` explicitly on each module in canonical sorted order; membership is never inherited from `parent`.

## Bind modules to code

Bind every owned, implemented module to the code that implements its responsibility using `repo`, `path`, and optional `symbol`.
Choose the binding granularity to match what the module owns:

- Bind a root module or code container to the directory that holds its files, or to the entry file that stands for that folder (such as `index.ts`, `__init__.py`, or `mod.rs`), so `check code` can measure its interface and module depth (`MODULE_SHALLOW` and export findings; see [module depth](design-lens.md#module-depth)).
- Bind a narrower part to a specific file or `symbol` when it owns one implementation inside a larger module.
- When `check code` reads a non-entry file or symbol binding, a measured module in the same model state and checkout whose directory contains that file covers it; otherwise `check code` skips depth measurement for that part with `binding-not-a-module`.

Never put a local filesystem path in `repo`: always use the registered repository identity.
End a directory `path` with `/` if the directory name contains a dot.

## Author true relationships

Author every relationship on its calling source module (`source` and `relationship.to` in `add-relationship`; `outgoing[].to` in module files).
Point each relationship in the direction the mechanism travels: from caller to callee, producer to queue or consumer, or component to the child it renders.

- Do not turn sibling calls into a chain: if module A calls module B and then calls module C, author `A -> B` and `A -> C`, not `B -> C`.
- Do not add reverse structural relationships for return values: keep returns inside flows.
- Keep `label` short (at most 60 characters), naming what the relationship carries or asks for.
- Cite an optional `anchor` (`repo`, `path`, `symbol`, with no line number) on the sending code or contract when proof helps verification or resolves an ambiguous edge.
- Use `emphasis` sparingly: `normal` by default, `hero` for the primary exchange in a view, and `muted` for secondary connections.
- Set `traffic` only when illustrative ongoing pulse motion clarifies the picture; omit it when traffic is off.
- Put enduring architectural connections in relationships, and put step-by-step request ordering, branches, retries, and return messages in flows.

### Choose the kind and the effect

Every relationship states its `kind`, how it travels between its two ends, and its `effect`, what it asks the target to do.
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
| `dependency` | Declares a requirement and runs nothing of the target: a type-only import, a package or a build.     |

Take the most specific contract that the source relies on.
When none of these says how a relationship travels, add a kind of the vault's own under `relationshipKinds` in `.archboard/config.yaml`, with its name and color.
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
Where the sites disagree or one is unknown, the check says nothing, and your reading decides.

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
A kind earns its place when a reader of the picture would act on it and the code decides it.
Do not add one for the role of the target, such as a cache or a logger: that belongs on the card.
Do not add one to split `sync` by what the call does: that is the effect.
Define it under `relationshipKinds` in `.archboard/config.yaml`, with a name, a color from the palette and the evidence kinds that prove it:

```yaml
relationshipKinds:
  workflow: { name: Workflow, color: lime, evidence: [call, configured-path] }
```

Its color is required, because the kind is the color of its lines.
Choose a color that no other kind of the vault uses. The kind sets nothing else of the line: the effect draws its ends.
Relationships of the vault's own kind state an effect too.
An entry with a built-in id replaces that kind whole.
`archboard model schema vault-config` prints the fields and the colors.

Done: every relationship that you author or touch names the kind whose row matches its code, and the effect that the three questions give.

### Evidence kinds and check code

`archboard check code` compares each relationship against source and infrastructure evidence using the active vault policy's `evidence` list for that kind.
In the default policy:

- `sync`, `async`, and `render` accept `call`.
- `http`, `rpc`, `event`, `queue`, `stream`, `spawn`, and `storage` accept `call` and `configured-path`.
- `dependency` accepts `call`, `configured-path`, `import`, and `build-dependency`.
- A vault-added kind that omits `evidence` accepts every evidence kind.

The six evidence kinds are:

- `call`: a runtime call, construction, value read, or component render in code.
- `configured-path`: an infrastructure-only link (such as a Kubernetes Service selecting a workload or a Terraform resource reference) or an environment variable read in bound code joined to the compose service, Kubernetes workload, or Terraform resource that supplies the target's address.
- `permission`: a declared access or IAM permission between parts.
- `import`: a source import without a runtime call (for example a type-only import; choose a kind that accepts `import`, such as `dependency` in the default policy).
- `build-dependency`: a package, workspace, or build-graph requirement.
- `provisioning`: infrastructure provisioning of one part by another.

When `check code` inspects relationships, act on its findings from source:

- `ANCHOR_MISMATCH`: the anchor lies outside both bound ends, or the file uses the symbol only as an evidence kind the relationship kind does not accept. It is a warning when any evidence at the anchor is resolved, and information when every match is by name alone. Fix the anchor, bind the owning part, or correct the relationship kind.
- `RELATIONSHIP_BACKWARDS`: an unanchored relationship whose evidence runs only the opposite way. Reverse it if the code runs that way, or anchor the proving code.
- `RELATIONSHIP_UNSUPPORTED`: an unanchored relationship with no accepted evidence joining its ends. Anchor the proving code or fix the relationship.
- `RELATIONSHIP_UNDRAWN`: bound parts call or construct each other with no drawn relationship (warning when resolved, information when matched by name or already represented at the boundary where their containers meet).
- `DEPENDENCY_CALLED`: a `dependency` backed by a runtime call into the target. Replace it with the runtime kind and effect.
- `CALL_TIMING_MISMATCH`: anchored calls disagree with `sync` vs `async`. Read the call site and fix the kind or anchor.

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
Two parts meet at the children of their nearest shared container, so one relationship between those children represents deeper calls across that boundary.
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
List `participants` in left-to-right reading order as the sequence columns should appear.
Use these step forms:

- Use `sync` (default) when the sender waits for the step, and `async` when it does not wait.
- Use `self` for a self-call, with the same module at both ends.
- Use `repeat` for a fixed count, such as retries or a known batch size. A note cannot replace it.
- Use `loop` for repetition that depends on data.
- Use `decision` for a branch.
- Use `return` for answers back without adding reverse structural relationships.

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
