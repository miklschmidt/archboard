---
id: TASK-368.11
title: The code check reads the interface of Terraform modules
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 16:59'
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
<!-- SECTION:NOTES:END -->
