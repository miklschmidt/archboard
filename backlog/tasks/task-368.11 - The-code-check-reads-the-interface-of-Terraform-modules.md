---
id: TASK-368.11
title: The code check reads the interface of Terraform modules
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 19:42'
labels:
  - interfaces
  - code-check
dependencies:
  - TASK-368.10
  - TASK-367.17
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: low
type: feature
ordinal: 647000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Terraform module's variables and outputs are its interface. A module that wraps one resource and passes each argument through as its own variable is Ousterhout's shallow module, and each such variable is his pass-through variable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A module's variables and outputs are reported as its interface
- [ ] #2 A variable passed unchanged to one resource argument is reported as a pass-through variable, and a module that wraps one resource is reported as shallow, both as information
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: none expected (the work stays inside Code facts and Code check, which Archboard server draws as modules); branch Archboard server@TASK-368.11 only if a description must change.
1. Code facts: a Terraform reference that is the whole value of an argument (bucket = var.bucket, nothing around it, not a meta-argument) carries that argument's path (Reference.argument, one hunk in facts.ts; terraform-adapter.ts referenceAt sets it). module-exposure.ts gains the Terraform ExposureRule (last in RULES): .tf/.tofu files, no entry file, root files = the configuration files directly in the directory, variables and outputs as top-level exposed names (member: never), and a rule hook saying which files are the module's: a Terraform module is flat, so a module below it (examples/) is outside and can call it.
2. Code check: the module reading (moduleReading, usesIn, withoutTests) moves out of interfaces.ts (592 of 600 lines) into module-reading.ts, which reads a Terraform module's uses from its calls: each argument a call outside sets is a use of var.X, each module.N.Y reference in the calling directory a use of output.Y. ENTRY_POINT_UNEXPOSED is not judged for Terraform (outside code can reach a module only through its outputs, so a drawn caller cannot reach past them). New terraform-modules.ts: VARIABLE_PASSED_THROUGH and MODULE_SHALLOW, information, on the container bound to the module, beside EXPOSED_UNUSED; MODULE_SHALLOW replaces VARIABLE_PASSED_THROUGH where it holds (no second finding).
3. Codes stated in the header of src/shared/code-check/index.ts.
4. Owners: code-facts module-exposure.test.ts (Terraform rule: root files, exposed names, outside includes a module below) and terraform-facts (argument of a whole-value reference); code-check terraform-modules.test.ts over a fixture: shallow module passing every argument through, deep module computing from its variables, root module calling both, a container per module.
5. Real modules in scratch (terraform-aws-s3-bucket and a thin wrapper) through a temporary vault.
6. Docs: authoring.md, evals/coverage.json, docs/design/cli-command-audit.json, check --code help in vault.ts, design-checks.md. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (7d6ddf02d): code-facts Reference.argument (facts.ts) set by terraform-adapter.ts for a reference that is the whole value of an argument; module-exposure.ts gains the Terraform rule (last in RULES) and the optional ExposureRule.holds hook; code-check module-reading.ts (moved out of interfaces.ts, which was at 592 of 600 lines, plus Terraform uses through module calls) and terraform-modules.ts (the shape and its two findings); interfaces.ts skips ENTRY_POINT_UNEXPOSED for a Terraform module and adds the shape findings beside EXPOSED_UNUSED. terraform-providers.ts exports isMetaArgument (one word, outside the named fence, so the adapter shares the meta-argument rule rather than repeating it); facts.ts one hunk, also outside the fence, because a field the adapter sets must be on Reference. Owners: code-check/tests/terraform-modules.test.ts, code-facts/tests/module-exposure.test.ts (Terraform rule) and terraform-facts.test.ts (argument).

Decisions (the ADRs leave these open):
1. Unchanged: the reference is the whole value of the argument, no expression around it (no attribute access, function, interpolation, conditional or object). A use inside the variable's own block (validation) is no use. A pass-through variable has exactly one use, and it sets one argument of a managed resource (a top-level resource block) that is no meta-argument (count, for_each, depends_on, lifecycle, provider, provisioner, connection, a dynamic block's for_each).
2. Wraps one resource: exactly one managed resource and no module call; data sources, ephemeral resources and locals aside, because they only feed what it manages.
3. Shallow: wraps one resource, passes at least one variable through, and every other variable is used only in that resource's count or for_each (a create toggle: a caller can say that on the module call). Found on terraform-aws-s3-bucket's modules/account-public-access: the strict rule (every variable passes through) would never call a terraform-aws-modules wrapper shallow, because each has a create flag in count (d386b1f96).
4. Codes: MODULE_SHALLOW and VARIABLE_PASSED_THROUGH, information, on the container bound to the module, beside EXPOSED_UNUSED (ADR 0046 table style: subject then state). MODULE_SHALLOW names every variable it passes through, so a shallow module gets no VARIABLE_PASSED_THROUGH (no second finding). Evidence: one piece per variable, its one use (kind from the provider tables, resolved).
5. Only a container is judged, as TASK-368.10 judges: a Terraform module drawn as a leaf card gets no shape finding. One path for every module-level finding.
6. A Terraform module is flat: the configuration files directly in its directory are its root files, and a module in a directory below it (examples/, wrappers/) is another module that can call it (ExposureRule.holds). Exposed names are var.X and output.Y, none a member.
7. Uses: a call outside the module whose local source resolves to it uses each variable its arguments set (module.N.var.X definitions) and each output that a file of the calling directory reads (module.N.Y references). A reference to the whole call (module.N) uses no output in particular and counts for none. A remote caller is out of sight, as the EXPOSED_UNUSED message already says.
8. ENTRY_POINT_UNEXPOSED is never judged for a Terraform module: outside configuration reaches a module only through its outputs, so a drawn caller cannot reach past them; without this the evidence that reaches a resource through an output gave a false warning (owned by terraform-modules.test.ts). CALLER_UNDRAWN applies unchanged with these uses.
9. The fact: a Terraform reference names the argument path it sits in (Reference.argument) and whether it is that argument's whole value (Reference.whole). Two flat optional fields, as joins and asType are. isMetaArgument is exported from terraform-providers.ts through code-facts/index.ts so the check shares the provider tables' meta-argument rule.

Commits: 7d6ddf02d feat (Terraform rule, module-reading.ts, terraform-modules.ts, Reference.argument), d386b1f96 feat (argument path plus whole flag; a count or for_each toggle keeps a module shallow; schema header), 601a75a96 docs (authoring.md, check --code help, CLI audit, coverage row, design-checks.md), 7509307ec vault (Archboard server adopts TASK-368.11), 45598294e refactor (shape keeps no repo). Each committed through safe-commit.sh with patches of only these hunks; facts.ts, shared/code-check/index.ts, authoring.md and design-checks.md hold other agents' uncommitted hunks that stay in the working tree.

Real modules (scratch t368-11-real, temporary vault, the real checkCode; terraform-aws-s3-bucket 5dc2f1f v5.16.1, terraform-aws-key-pair f3221d3 v3.0.1; containers bound to each root module and to s3-bucket's modules/account-public-access, modules/object, modules/notification, examples drawn as callers; 302 ms): before this task all 5 containers were skipped as exposure-unknown. After: MODULE_SHALLOW on account-public-access (one aws_s3_account_public_access_block, 5 of 6 variables passed through, var.create only sets count); VARIABLE_PASSED_THROUGH on object (22 of 27; not shallow: storage_class and the two object lock variables go through upper(), override_default_tags decides a dynamic block), on the s3-bucket root (15 of 72), on notification (1 of 11, var.eventbridge) and on the key-pair root (5 of 10 across aws_key_pair and tls_private_key); EXPOSED_UNUSED on the s3-bucket root (3 of 87 names, all outputs: the examples and wrappers/ set every variable) and on notification (1 output). No ENTRY_POINT_UNEXPOSED, no CALLER_UNDRAWN. Every finding read against the source is right by the rule.

Dogfood: this repository has no Terraform. A direct pass over .archboard/vault from a HEAD copy before and after this task gives the same 40 lines (4 CALLER_UNDRAWN, 13 EXPOSED_UNUSED, 22 RELATIONSHIP_UNDRAWN, exposure-unknown Browser client): the move of the module reading changed nothing. Board: Archboard server@TASK-368.11 changed only the Code check description (it lists every finding code, so it names the two new ones; 1999 of 2000 characters), branched from TASK-367.12 review at v146, summary set to the board's scope, check --code with and without --variant: no line differs, adopted at v151; ./bin/dogfood check: no diagnostics. Footprint against base 82aacb574 (parent of 7d6ddf02d): namedAndChanged Code check; changedNotNamed Code facts (7d6ddf02d, d386b1f96 add the Terraform exposure rule and two Reference fields inside the part; its description says each language's rule in module-exposure.ts says what a module exposes, which stays true; the other commits in range are other tasks'); current was the proposal's parent. The vault commit carries the board file as the server holds it, including the TASK-367.27 layout proposal another agent shelved and restated.

Gate (lanes one at a time, shared working tree): lint 1, only in others' uncommitted files (language-servers swift-package.ts, languages.ts, server.ts, session.ts; nix-derivations.ts, nix-values.ts, nix-adapter.ts); lint:tests passed. fmt:check 1, only language-servers languages.ts and tests/fixture.ts (others'). type-check 1, only compose-runners.ts, environment-join.ts, kubernetes-runners.ts, terraform-runners.ts (another agent's uncommitted Reached type). build:frontend 0. test:modules 4233 pass 1 fail: network-hop.test.ts (reach.to.map in another agent's uncommitted environment-join.ts; passes on a HEAD copy, 144/0 with the code-check and code-facts owners). wide-boards.test.ts passed this run. test:system 195/0. test:repository 20/0. test:serial-browser exit 0. eval:skill check: suite ok. HEAD copies plus each code commit: tsc clean in code-check and code-facts, owners 143/0.

Left out: a Terraform module drawn as a leaf card gets no shape finding (decision 5); a reference to a whole module call (value = module.x) counts as a use of no output; a module wrapper around one module call (no resource, terraform-aws-modules wrappers/) is never shallow by this rule.

Independent review (2026-10-06): NOT CLEAN before its fixes, which are 7b6f32b83, 815f46539, d0ddba3d3 and 77792cde9.

1. Decision 3 let a variable in the `for_each` of the wrapped resource toggle it, like a variable in `count`. A `for_each` over a variable carries the variable's data into the arguments through `each.value` and `each.key`, and no reference shows that. terraform-aws-cloudwatch's metric-alarms-by-multiple-dimensions sets `dimensions = each.value` from `for_each = { for k, v in var.dimensions : k => v if var.create_metric_alarm }`, and terraform-aws-security-group sets every argument of its ingress rules that way. A module like that, with every other variable passed through, read as shallow. Now only a variable that the module uses nothing but in the wrapped resource's `count` is a toggle. `count.index` carries no data, so any use of the variable's data needs a second reference, which the rule sees (terraform-modules.ts onlyCounts). Owner: terraform-modules.test.ts, modules/alarms.
2. Decision 2 set data sources and locals aside. Where the wrapped resource reads one (`kms_master_key_id = local.key`, `policy = data.aws_iam_policy_document.this.json`), the module decides that argument for its callers. When every variable passes through, the module is still not shallow. Now the resource reads no address but its pass-through variables, outside its meta-arguments, or the module is not shallow (readsOnly). Owner: terraform-modules.test.ts, modules/topic.
3. Decision 7 (a reference to the whole call, `value = module.x`, uses no output): wrong. Terraform evaluates `module.x` to the object of all its outputs. Every terraform-aws-modules module has wrappers/outputs.tf with `value = module.wrapper`. On terraform-aws-s3-bucket, EXPOSED_UNUSED named 3 outputs that the wrapper passes on, and its advice, stop exposing them, changes the wrapper's output. A whole-call reference now uses every output, except in `depends_on`, which only orders (module-reading.ts outputsRead). Owner: the first test of terraform-modules.test.ts (`output "bucket" { value = module.bucket }` and `depends_on = [module.queue]` in the fixture).
4. A finding on a module at the root of its checkout named it `""`. Terraform puts a repository's main module at its root as a rule (s3-bucket, key-pair, security-group). MODULE_SHALLOW, VARIABLE_PASSED_THROUGH and the three interface findings now name it ".", as the exposure-unknown skip already did.
5. The schema header of src/shared/code-check/index.ts named every finding code but the four that the text reading gives. It now names all of them (d0ddba3d3), so the board can point to it.
6. Docs followed the rules: authoring.md, the coverage row, the schema header and the design note, which records the review's run (815f46539).

The widened "shallow", judged: kept for `count`, narrowed for `for_each` and for a resource that reads anything else. Ousterhout's shallow module has an interface about as large as what it does. A create toggle in `count` adds one variable. A caller can write the same thing on the call itself (`count` on a module call, since Terraform 0.13). So the toggle leaves the module no deeper. The strict reading of ADR 0044 ("passes each variable through") calls no terraform-aws-modules wrapper shallow, because each has `create` in `count`. I read each module that the rule now calls shallow against its source: cloudwatch log-group, log-stream, query-definition and log-metric-filter, iam's iam-policy, and s3-bucket's account-public-access. Each manages one resource with `count = var.create ? 1 : 0` (or `var.create_cloudwatch_log_metric_filter`). Each passes every other variable to one argument unchanged. This is a departure from the literal wording of ADR 0044, recorded here.

Known gap: a literal argument (`block_public_acls = true`) carries no reference, and code facts keep no argument without one. So a wrapper that fixes an argument to a constant, as an internal module that enforces a setting does, still reads as shallow.

Decisions judged:
- 1 (unchanged means the whole value with no expression, one use, and an argument of a managed resource that is no meta-argument): agree. Probed on `(var.x)`, `"${var.x}"`, `var.x.attr`, `var.x[0]`, `!var.x`, a list, an object and a nested block: only the bare reference and the nested block's argument are whole.
- 5 (only a container is judged): agree. It is the one path of every module-level finding.
- 8 (no ENTRY_POINT_UNEXPOSED for a Terraform module): agree. Outside configuration can name only a module's outputs, so every reach of an inner resource passes through the interface. Removing the skip fails the owner.
- ExposureRule.holds and the flat module: harmless. The hook is optional, and every other rule keeps `within`. The code-check and code-facts tests of every adapter: 33 files, 162 pass, 0 fail.
- Reference.argument and Reference.whole: the smallest change. The `count` toggle needs the argument of a reference that is not a whole value, and both fields are documented in facts.ts. isMetaArgument is one exported word, so the check shares the provider tables' rule.
- module-reading.ts: a real seam. It is the code's side of the interface (what a module exposes, how outside files use it, and a Terraform module's shape). interfaces.ts reads one ModuleReading and does not know how Terraform uses are found.
- Tests: behaviour and contracts. Each of the four rules fixed here, and the ENTRY_POINT_UNEXPOSED skip, has one owner that a mutant of it fails.

Real modules (scratch r368-11-real, temporary vault, the real checkCode): terraform-aws-cloudwatch 82e5143 (v5.7.3), terraform-aws-iam da8e6a8 and terraform-aws-security-group b3c1b2e, with the implementer's terraform-aws-s3-bucket 5dc2f1f and terraform-aws-key-pair f3221d3. 17 containers, each with a child per resource and an example drawn as its caller, in 947 ms. After the fixes: MODULE_SHALLOW 6, VARIABLE_PASSED_THROUGH 10, EXPOSED_UNUSED 0 (1 before: the 3 outputs of the s3-bucket root), no ENTRY_POINT_UNEXPOSED, no CALLER_UNDRAWN. Each finding, read against the source, is right by the rule. metric-alarm passes 21 of 23: its metric_query blocks look values up with defaults. log-subscription-filter passes 5 of 7: an output also reads `name`. iam-oidc-provider passes 1 of 4: it uses `url` twice and computes `client_id_list`. The security-group root passes 3 of 14.

Board: the Code check description listed every finding code at 1,999 to 2,000 of 2,000 characters. It now says in words what the check judges (1,813 characters). It points to the schema header for the codes, and to authoring.md for what each code asks. Archboard server@TASK-368.11 review was branched from TASK-367.14 at v163. semantic compare: only Code check changed, no interface change. check --code with and without --variant: 44 lines each, no difference. Footprint against 82aacb574: current is the proposal's parent. namedAndChanged: Code check. changedNotNamed: Code facts (this task's Terraform rule and Reference fields, inside the part), Archboard server and Language servers (other tasks' commits). Adopted at v166 (77792cde9). ./bin/dogfood check: no diagnostics.

Gate after the fixes, one lane at a time, in the shared working tree: lint 0, fmt:check 0, type-check 0, build:frontend 0, test:modules 4265 pass and 0 fail, test:system 195 and 0, test:repository 21 and 0, test:serial-browser 24 and 0. src/runtime/skill-evaluation with install-targets.test.ts: 242 and 0. eval:skill check: suite ok (20 scenarios, 20 fixtures, 14 coverage parts).
<!-- SECTION:NOTES:END -->
