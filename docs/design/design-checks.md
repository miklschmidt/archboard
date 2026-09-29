# Design checks: code, interfaces and history

Three proposals hold a board to the design principles of the engineering skills
in this repository: deep modules, seams, information hiding and locality. Each
proposal is a parent task in Backlog, and each has small subtasks. This note holds
the facts, the measurements and the open decisions that the tasks share.

- Proposal 1 (TASK-367): check the board against the code and the
  infrastructure.
- Proposal 2 (TASK-368): derive the interface of each container from the
  board.
- Proposal 3 (TASK-369): read the Git history of a board through its bindings.

A visual summary of the three proposals is at
<https://claude.ai/artifact/6bvGCNdthJh2CoHvPaCjNS> (private to the owner).

## What was measured

All numbers come from `.archboard/vault` at commit `048312ee` on 2026-09-29.

- The 15 current boards have 282 parts and 202 relationships that cross a code
  module (`src/<area>/<module>`). 37 of these relationships end on a part that
  is bound to a private file of another module. The lint of this repository
  forbids such an import, so the board draws the implementation and not the
  interface.
- 9 of the 15 boards draw no container at all.
- Board persistence: 23 relationships join two bound files. A runtime import
  stands behind 22 of them. The last one, Write under lease to Lifecycle
  transitions, is a call through a value that `write.ts` receives, so only a
  type import is visible. The code has 3 runtime calls that the board does not
  draw: `diagnostics.ts:100`, `settle.ts:257` and `shelve.ts:148`. 7 parts
  import the shared address helper, and 5 imports are type-only.
- `src/runtime/semantic-board-store/index.ts` exports 40 names from 12 of the 32
  private files. 18 of the 40 names have no caller outside the store: 5
  functions and constants, and 13 types.
- Commits to bound files since each board was last written: Board viewer 10,
  Command interface 3, Codex session 2, four boards 1, eight boards 0. A part
  that drills into its own board must be skipped. Archboard server binds its
  Semantic renderer card to a whole directory, which adds 259 commits.
- Change coupling with the code-maat filters (commits of 30 files or fewer, at
  least 5 shared commits, degree 30% or more): Architecture painter and
  Sequence painter changed together in 6 commits (degree 36%), and no
  relationship joins them. Without the 30-file filter, Claims and Panes look
  coupled, but 10 of their 12 shared commits were sweeps of 50 to 864 files.
- Earlier evidence: TASK-257 found 9 of 89 bindings dead after 141 commits with
  no vault update. TASK-328 found boards whose bindings exist but whose
  descriptions no longer match the code.

## Proposal 1: check the board against the code

The consumer skill makes an agent write one line of evidence for every
relationship: a file and a symbol (evidence rule 3). The product discards that
line, because a relationship has no field for it. The code check keeps the line
as an anchor and reads the code again.

The check reads the current variant of every board. A draft is ahead of the
code (ADR 0031). If an agent names a draft, for example when a task closes, the
check reads it. Historical and shelved variants are records, and the check
never reads them.

### Evidence kinds

Not every link in code or infrastructure is a relationship at run time. Each
finding names the kind of evidence that it rests on.

| Kind | What it proves | Examples |
| --- | --- | --- |
| Call | The source makes the call or triggers the work | a call site, a queue that triggers a function, a topic subscription, a route to a service |
| Configured path | Configuration connects the two parts | an environment value set to another service's address, a service selector, a network rule |
| Permission | Access is allowed, not that it happens | an IAM grant, a network policy that allows traffic |
| Import | Code depends on other code | an import, an include, a `using` with a reference |
| Build dependency | One part is built from another | a Nix input, a project reference, a package target dependency |

How the relationship kinds of a vault map to these evidence kinds is an open
decision. Vault vocabulary is consumer-defined (ADR 0024), so the mapping can
be a default by kind name or a new key in the configuration.

### The engine

Tree-sitter parses every language in one way: a query file per language finds
definitions, references and imports. The results are candidates, because a
name can match more than one definition. A language server then resolves each
candidate to its definition. When no language server is installed, the check
says so and reports candidates.

Two adapters exist from the first day (TypeScript and Python), so the seam
between the check and the languages is real.

The engine is new: `web-tree-sitter` and a WebAssembly grammar per language.
The user must approve these dependencies. Archboard has no build step (ADR
0014). Every grammar must load under Bun from a published WebAssembly file. If a
grammar has no such file, the cost to build one must be known.

### Languages

| Language | Dependencies in the source | Declared interface | Language server |
| --- | --- | --- | --- |
| TypeScript | `import` and `export` | module root files and `package.json` `exports` | typescript-language-server |
| Python | `import` and `from ... import` | `__all__`, names that start with `_`, `__init__.py` | pyright or basedpyright |
| C# and .NET | `using` plus type references, `ProjectReference` | `public`, `internal`, `InternalsVisibleTo` | csharp-ls or the Roslyn language server |
| Swift | module `import`, type references, `Package.swift` targets | `open`, `public`, `package`, `internal`, `fileprivate`, `private` | sourcekit-lsp |
| Objective-C | `#import`, `@import`, message sends | public headers, class extensions in `.m` | clangd |
| C and C++ | `#include` through `compile_commands.json` | public headers, `static`, anonymous namespaces | clangd |

In C# and Swift, the files of one project or module see each other without an
import. There, file dependencies come from references to names that another
file defines.

### Infrastructure and Nix

| Source | What the check reads | Evidence |
| --- | --- | --- |
| Terraform and OpenTofu | `.tf` and `.tofu` files, statically: resources, data sources, modules, variables, outputs and the references in expressions | provider rules decide call, configured path, permission or provisioning |
| Kubernetes | manifest YAML, and Helm or Kustomize output given as files | service selectors, Ingress and Gateway routes, network policies, environment values that name a service |
| docker-compose | compose files and their override files | `depends_on`, links, networks, environment values that name a service, shared volumes |
| Nix | `flake.lock` (JSON), `flake.nix` outputs, derivation inputs | build dependency |

A part binds to a resource address as it binds to a code symbol. Examples are
`module.checkout.aws_lambda_function.api`, `Deployment/checkout` and
`packages.x86_64-linux.archboard`.

Nix says nothing about run time. It shows software dependencies that are not
explicit anywhere else: flake inputs, and the packages that a derivation is
built from.

The strongest result joins code and infrastructure. The code reads
`QUEUE_URL`, and the infrastructure sets `QUEUE_URL` for that service to the
address of a queue. Together they prove a relationship across a network hop,
which no code analysis can prove alone.

### Safety

The check reads files only. It never reads Terraform state, because state holds
secrets in plain text, and the Archboard server has no authentication. It never
runs `terraform plan`, `kubectl` or `nix eval`, because these need credentials,
reach the network or run code. A plan JSON that CI already produced is an
optional input. The difference between the infrastructure code and the live
cloud stays the job of `terraform plan`.

## Proposal 2: derive each container's interface

A container's interface is the set of its children that relationships reach
from outside the container. The store can derive this set from the board, so
it needs no new authored field (ADR 0031). The store derives five measures:
the entry points, the hidden parts and the callers. The other two are the
relationships that leave the container and the entry points that only pass one
call through.

The measures need their own name, because "scorecard" already means how
readable a drawing is. The skill must draw a module that a board describes as a
container, so that callers land on its entry points. Comparison reports
interface changes before implementation changes, because an interface change
costs every caller.

## Proposal 3: read the history through the bindings

Every commit maps onto the parts whose bound files it changed. A binding to a
directory counts every file below it. A part that drills into another board is
skipped, because its own board carries its history. One mapping gives three
readings:

- Staleness: commits to bound files since the board was last written.
- Footprint: the parts that a branch changed, against the parts that its
  proposal names.
- Locality: hotspots, and change coupling between parts that no relationship
  joins.

The readings are derived on request. They are never stored in a board (ADR
0015) and never drawn as traffic (ADR 0027). Call the co-change measure change
coupling. "Temporal coupling" means three different things in the three books.

## Prior art

- ArchUnit checks code dependencies against a PlantUML diagram. It does not
  check that each drawn relationship exists.
  <https://www.archunit.org/userguide/html/000_Index.html#_plantuml_component_diagrams_as_rules>
- Tach declares module interfaces for Python and refuses deep imports.
  <https://github.com/tach-org/tach/blob/main/docs/usage/interfaces.md>
- IcePanel checks that the code links of its nodes still exist, not its
  connections. <https://docs.icepanel.io/integrations/linking-to-reality>
- Inframap reads Terraform HCL or state and keeps the relevant resources and
  connections per provider. It draws a diagram and checks no authored claim.
  <https://github.com/cycloidio/inframap>
- code-maat computes change coupling from `git log`.
  <https://github.com/adamtornhill/code-maat>
- Sources for the principles: Ousterhout, *A Philosophy of Software Design*.
  Thomas and Hunt, *The Pragmatic Programmer*. Feathers, *Working Effectively
  with Legacy Code*, chapter 4. Parnas, "On the Criteria To Be Used in
  Decomposing Systems into Modules".

The survey found three gaps. No tool stores an anchor for each relationship of
a diagram and reads it again. No tool compares competing authored proposals by
their interfaces. No tool maps a branch onto the parts of an authored
architecture.
