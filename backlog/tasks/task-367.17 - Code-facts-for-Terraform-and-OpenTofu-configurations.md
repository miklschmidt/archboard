---
id: TASK-367.17
title: Code facts for Terraform and OpenTofu configurations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 15:43'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 625000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Infrastructure declares the relationships that code analysis cannot see: the queue a function reads, the route to a service. The check reads `.tf` and `.tofu` files statically, with no `init`, no credentials and never the state, because state holds secrets in plain text. A part binds to a resource address through the binding symbol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Resources, data sources, modules, variables and outputs are definitions with their addresses, and the references in expressions are references
- [ ] #2 A part bound to a resource address is reported when the configuration no longer declares it
- [ ] #3 A relationship between two resource-bound parts is supported when a reference joins them, and references that the board does not draw are reported as in the undrawn check
- [ ] #4 A plan JSON from `terraform show -json` or `tofu show -json` is an optional input when an agent names one
- [ ] #5 The check never reads state, never runs `terraform` or `tofu`, and never reads a secret value
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.17 changes the descriptions of Code facts (the Terraform adapter, the address space of a root module, named plans) and Code check (bindings to resource addresses, Terraform evidence, --plan). No new part or relationship: the adapter lives inside src/runtime/code-facts, which the board draws as one module.
1. Code facts, one file at a time: terraform.scm and terraform-adapter.ts over tree-sitter-terraform.wasm (.tf, .tofu). Definitions with their addresses: resource T.N, data.T.N, ephemeral.T.N, module.N, var.N, output.N, local.N, and each argument of a module call as module.N.var.X, the address of the variable it sets. References: every address an expression names (attributes, index keys and splats dropped), configured-path evidence; not count/each/path/terraform/self, names a for or dynamic block binds, provider/providers/ignore_changes, or moved/import/removed blocks. A module call with a source is an import, resolved by terraform-resolution.ts to the module's directory when it is a local directory of the checkout. AdapterName gains terraform; Reference.kind gains configured-path; lookup matches a Terraform address whole.
2. Code facts, the address space (terraform-configuration.ts): one root module, read across the directories its local module calls name; declared(address), and reached(address) through variables, module arguments, outputs and locals. A remote module is not read; a named plan JSON (terraform-plan.ts, configuration section only: addresses and references) fills in the modules the check does not read. A pass carries the named plans.
3. Code check: a binding whose path is a Terraform root module (a directory that holds .tf or .tofu files, or such a file) is held to the root's address space (part-code, check, support); an address inside a module not read is skipped as module-not-read. Terraform evidence joins resource-bound parts by the narrowest address, else by the bound code that holds the declaration. A Terraform reference is resolved evidence.
4. --plan <file> (repeatable, with --code): the CLI sends absolute paths, the route refuses a plan outside every registered checkout, one the check never reads or one that is not a plan JSON (PLAN_REFUSED).
5. Owners: code-facts/tests/terraform-facts.test.ts over fixtures/terraform-shop (root calling a local child module, references, a data source, variables, outputs); code-check/tests/terraform-check.test.ts (missing address, supported and undrawn references, a plan, the safety fixture with terraform.tfstate, .tfvars and .terraform/ and fake terraform/tofu on PATH).
6. Try terraform-aws-vpc through a temporary vault; docs: authoring.md, design-checks.md, cli-command-audit.json, check --code help.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (b5c8c44b4 code facts, 471678fdd takes another task's reader hunk back out of b5c8c44b4, e8823cf51 check/route/CLI, 089006ed2 docs, c-vault commit below): code-facts gains terraform.scm, terraform-adapter.ts, terraform-address.ts, terraform-resolution.ts, terraform-configuration.ts and terraform-plan.ts, one entry in ADAPTERS and "terraform" in AdapterName. code-check gains terraform-evidence.ts and plans.ts; symbols.ts holds a binding to a Terraform root through its address space; check.ts, part-code.ts, support.ts and anchor-kind.ts take small hunks; checkoutSkips moved from check.ts to checkouts.ts so check.ts stays under 600 lines. The route takes plan=<absolute path> (repeatable) and refuses PLAN_REFUSED; `check --code --plan <file>` sends absolute paths. Owners: code-facts/tests/terraform-facts.test.ts over fixtures/terraform-shop (root module infra calling the local modules/queue and the remote network module, a data source, locals, variables, outputs, plan.json written by hand to the documented format); code-check/tests/terraform-check.test.ts (criteria 2-5, with the safety fixture); one case each in cli/commands/tests/check-code.test.ts and server/archboard/tests/code-check-route.test.ts. code-check.test.ts: infra/dns.tf is now parsed, so its text-only skip is gone and the instance-key case is held by address matching.

Contract changes (smallest found): FactsPass gains `plans`, and CodeFacts.pass(signal, plans?) takes the named plans, so every reader of the pass can build the address space without threading plans through code-check contexts. ResolvedImport.resolved is a directory for a Terraform module call (documented in facts.ts). lookup.findSymbol matches a Terraform address whole (no tail or last-name match), so aws_sqs_queue.jobs never finds data.aws_sqs_queue.jobs. heldInFiles takes an optional Terraform root. Shared schema: skip reason `module-not-read`. Reference.kind already allowed configured-path at HEAD.

Decisions the ADR left open:
1. Grammar: tree-sitter-terraform.wasm (the terraform dialect of tree-sitter-hcl 1.2.0). It gave the same tree as the hcl grammar on every sample tried, and it is the dialect upstream builds for Terraform's templates. .tf.json is not read (machine-written JSON syntax; read as text).
2. Definitions: resource T.N, data.T.N, ephemeral.T.N, module.N, var.N, output.N, local.N, and each argument of a module call as module.N.var.X (the caller's value for the child's variable X, the same address the child's variable has in the root's space). Visibility word = the block kind; variables and outputs are exposed (a module's interface, TASK-368.11), everything else is not. moved/import/removed/terraform/provider/check blocks declare nothing.
3. References: each address an expression names (attributes, index keys and splats dropped), kind configured-path, one per address and line (not one per spelling per file: a resource referenced from two blocks must keep both). Not references: count, each, path, terraform, self, names a for expression, a template for or a dynamic block (its label or iterator) binds, the arguments provider, providers and ignore_changes, and the blocks moved, import and removed.
4. Address space (the contract could not express directories, so it lives in code-facts' terraform-configuration.ts, read once per pass and root): the root module is the bound directory that holds .tf/.tofu files directly, or the directory of a bound .tf file; a binding symbol is relative to it. Local module calls (./ or ../ sources resolving to a module directory of the checkout) are read recursively (depth 32, a module calling itself stops); each call gives its instance its own prefix. A remote source is never read, nor the copy under .terraform. A module instance two calls make shares its files; parts bound to two instances are told apart by their addresses.
5. Reaching: a resource, data source, ephemeral resource or module call reaches another through variables, module arguments, outputs and locals (BFS); module.x.out reaches output out of x when x is read, else the module call itself. The piece cites the referring declaration's own reference (file and line), or the plan file at line 1 for a reference only a plan names.
6. Ownership of a declaration in a root's space: the part bound in that root to the longest address that is it or holds it (module.queue owns the instance); otherwise the narrowest binding holding the declaration's block (a symbol from another root, the file, a directory), as all evidence; a plan-only declaration is held by its module call's block. Generic file evidence gives nothing for .tf references (no target), so Terraform evidence comes only from the address space.
7. A binding whose root does not declare the address falls back to the bound files another adapter parses (a symbol of another language in the same directory); a file read as text never stands in (found on terraform-aws-vpc: a README held the last name).
8. Anchors: ANCHOR_SYMBOL_MISSING and the evidence-kind half of ANCHOR_MISMATCH apply (a Terraform reference is resolved), but the check does not judge where a Terraform anchor's symbol is declared: a joining declaration such as an event source mapping is in neither end's code by design (ADR 0046), and which declarations join is TASK-367.18's rule.
9. --plan: the CLI sends absolute paths; the server reads a plan only inside a registered checkout before and after links resolve, never a neverRead path; Git need not list it (plans are usually ignored). Any refused plan refuses the whole check (PLAN_REFUSED, exit 2), because an agent asked for it. A plan describes the root module of its directory. From it only configuration addresses and references are kept (never constant_value, variables, planned_values, prior_state, resource_changes). The configuration on disk decides every module the check reads; a plan fills in only the instances it does not read, so a stale plan cannot bring back a removed declaration.

terraform-aws-vpc (b3abd6df2e, 6.7.3, cloned to a scratch directory): 77 .tf files cold 172 ms, warm 2 ms; 2,631 definitions, 3,090 references, no unparsed line. A temporary vault with one board of 10 parts bound to the root module examples/complete and 5 relationships through the real checkCode: 214-216 ms cold, 95-106 ms warm. Findings: BINDING_SYMBOL_MISSING on the planted module.vpc.aws_vpc.gone and module.vpc_endpoints.aws_nat_gateway.this; RELATIONSHIP_UNDRAWN (warnings, resolved) VPC <- public subnets (aws_vpc.this main.tf:157) and flow log (local.vpc_id vpc-flow-logs.tf:45), internet gateway <- NAT addresses (depends_on main.tf:1225) and NAT gateway (main.tf:1253), NAT gateway <- private NAT route (main.tf:1263); RELATIONSHIP_UNSUPPORTED (information) public subnets -> private NAT route, right: the subnet names no route. NAT gateway -> public subnets, NAT gateway -> NAT addresses, internet gateway -> VPC and endpoints module -> VPC (through the argument vpc_id = module.vpc.vpc_id and the vpc module's output) are supported.

Closing: Archboard server@TASK-367.17 branched from JDl7Ci6C; TASK-367.21 adopted after, so the change (Code facts and Code check descriptions) was restated on "TASK-367.17 after TASK-367.21", TASK-367.17 shelved with that reason, and the restated proposal adopted. check --code with and without --variant: no line differs; no finding is about Code facts or Code check. Footprint against base f0222a83e: namedAndChanged Code facts, Code check; changedNotNamed Archboard server and Code check route (e8823cf51: the route takes plan and refuses PLAN_REFUSED, still the one call to Code check; the board stays true); namedNotChanged none; 5 drill-down parts skipped. ./bin/dogfood check: no diagnostics. Behind: Command interface Vault check and Commands (vault.ts takes --plan; Vault check still calls the code check after the plain check, the board stays true).

What TASK-367.18 plugs into: terraform-adapter.ts sets every reference's kind to configured-path in referenceAt; a provider rule can set call/permission/provisioning per reference (the enclosing block's type is the from-address, the reference's address names the target type), and terraform-evidence.ts's piecesIn takes link kinds instead of the constant configured-path. Joining declarations (event source mappings) need a rule in TASK-367.18, and support.ts then judges Terraform anchors again.
What TASK-368.11 plugs into: variables and outputs are exposed definitions (visibility variable/output) per module directory, the configuration reaches through var/output, and module-exposure.ts's RULES can add a Terraform rule whose root files are a module directory's .tf files; pass-through detection needs which resource argument a var reference sits in, which facts do not yet carry.

Gate (lanes one at a time, working tree with other agents' uncommitted work): lint exit 1 only in others' files (lint:tests: zz-debug-11.test.ts, c-facts.test.ts; lint:policy: evidence.ts max-lines from another task's uncommitted hunks, csharp-adapter.ts, csharp-resolution.ts, c-adapter.ts, c-unparsed.ts); fmt:check exit 1 only on others' files (c-*, zz-debug-11); type-check 0; build:frontend 0; test:modules 4192 pass 1 fail (wide-boards.test.ts Archboard server first layout over its 3 s bound at load average 16, also failing before this task's board change); test:system 194/1 (staleness-frontend after other agents edited source past the build; 1/0 after build:frontend); test:repository 20/0; test:serial-browser exit 0. HEAD plus each commit alone: tsc 0, the touched modules' lint and fmt clean, code-facts and code-check owners pass with --isolate.
<!-- SECTION:NOTES:END -->
