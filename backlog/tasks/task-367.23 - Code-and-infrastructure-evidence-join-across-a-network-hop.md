---
id: TASK-367.23
title: Code and infrastructure evidence join across a network hop
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 17:10'
labels:
  - code-check
dependencies:
  - TASK-367.07
  - TASK-367.20
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 631000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Code shows that a part reads a configuration value such as `QUEUE_URL`. Infrastructure shows that the value is set, for that service, to the address of another part. Together they prove a relationship that neither proves alone. docker-compose comes first, because its services name each other directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A code anchor that reads an environment value, together with a compose file that sets the value for that part's service to another part's address, supports the relationship between the two parts as a configured path
- [x] #2 The same join works for Kubernetes environment values and Terraform settings when those adapters are present
- [x] #3 A relationship across a network hop that no evidence supports is reported as unsupported, and one with evidence only on one side says which side is missing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.23 only if the Code check description must change (it names the evidence it reads); otherwise none.
1. Facts (code-facts, only what the compose adapter already reads): a compose service's definition carries the directory whose code it runs (its build context, or the Dockerfile's directory inside it), as an optional Definition.runs; code-facts/index.ts exports the compose file names.
2. New module src/runtime/code-check/lib/environment-join.ts: the seam is a list of settings (an infrastructure declaration sets environment name N, at a file and line, and its value names declarations), fed by one reader per infrastructure adapter (compose first, Terraform if its facts give environment names). The check knows that a declaration S runs the code of a read when S builds the deepest directory that holds the reading file (compose build), or the reading part is, or is inside, a part bound to S's address (board containment, for an image built elsewhere). The value's target reaches the parts whose code it runs (by its build), else the parts that own its declaration. A read of N in code that a declaration S runs, where S sets N to Q's address, is one resolved configured-path piece from the reading part to Q, with the setting as its partner piece.
3. Wiring: check.ts appends the join pieces to the evidence for the relationship judgement only (not the interface check); relationships.ts shows each join piece with its partner, and an unsupported relationship whose kind accepts configured-path says which side has evidence (shared schema: optional missing: code | infrastructure on the finding).
4. Owner: code-check/tests/network-hop.test.ts over a fixture with a TypeScript service and a Python service wired by compose: supported both ways, undrawn, missing code, missing infrastructure, plain unsupported, env_file names, override replacement.
5. Try on docker awesome-compose through a temporary vault; docs: authoring.md (anchoring a network hop), design-checks.md; remove the TASK-367.23 sentence in archboard-dev step 1.
6. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (5431eb4ea): src/runtime/code-check/lib/environment-join.ts (the join and the sides of an unsupported relationship), compose-runners.ts (the compose reader of the seam), code-facts compose-build.ts (Definition.runs of a compose service), relationships.ts (partners and missing), shared schema (missing on the finding). Owner: src/runtime/code-check/tests/network-hop.test.ts.

Decisions the ADR left open:
1. The seam is a runner: an infrastructure declaration that runs code and sets its environment, with the directories it runs (as its files say), the parts bound to it, and each value it sets with the parts that value names. Each infrastructure reader (compose now) gives runners; the join is generic.
2. How the check knows S runs P's code. (a) Files: S builds the deepest directory that holds the file that reads the value. A compose service runs its build context, or, where the context is the compose file's own directory (the monorepo case, context . with dockerfile api/Dockerfile), the Dockerfile's directory. A Git URL or absolute context runs nothing here. A deeper build wins, so a service that builds the whole repository runs only code no deeper build holds. (b) The board: the part that owns the read is, or is inside, a part bound to S by its symbol (services.worker). This is how an image built elsewhere (image:, a Kubernetes workload) says which code it runs. A file or directory binding that only happens to hold the compose file does not count, because a part bound to the repository root would then run every service. A drawn relationship (S -> P runs) is not used: relationship kinds are the vault's vocabulary, and the board would prove itself.
3. What a value's address reaches: the parts whose code the named service runs (the outermost parts bound inside the directory it builds), else the parts that own its declaration (narrowest binding, as every compose piece). A service that builds the repository root names no part by its build. Only one of the two, so a board that draws a service part around its code part is not told twice.
4. A joined read is two pieces from the part that owns the read (narrowest binding) to the part reached: the read (code file, line, name) and its partner (compose file, line, name). Both configured-path and resolved, because the name, the service and the build directory are written in files. The first join per pair of parts is kept. Findings show a piece with its partner.
5. Which side has evidence (criterion 3), only for a relationship whose kind accepts configured-path (a network hop in the default vocabulary: http, rpc, event, queue, data, dependency) and only where nothing supports it: missing code when a runner of the start's code sets a value that names the end and that code reads none of those names (evidence: where it is set); else missing infrastructure when the start's code reads names that no runner of that code sets at all (evidence: each such read, first per name). A name set to a host outside, or from an env file whose value is never read, counts as set. Neither side: plain unsupported as before. The field is missing: code | infrastructure on the finding, so it is machine-readable; the message says the same.
6. A value set inside infrastructure (compose, env, kubernetes, terraform adapters) is set, never read; every other adapter's environment reference is a read.
7. The join pieces feed the relationship judgement only, not the interface check (TASK-368.10): a network hop says nothing about what a module exposes.
8. The check reads every compose file of each repository whose code the board binds, bound or not, because the compose file is what runs that code.

Terraform and Kubernetes (edb7d34d9, b7a32d64d). Both adapters landed during the task, so both feed the join; the readers are listed in src/runtime/code-check/lib/infrastructure-runners.ts.
9. Terraform: the adapter records the name of each environment value a resource sets as a reference by environment at the line of its value (code-facts/lib/terraform-environment.ts): a map under variables in an environment block (aws_lambda_function), an environment_variables, runtime_environment_variables or app_settings map, and an env block with a literal name (Cloud Run, the kubernetes provider). These are shapes by name, never by provider; an encoded string (ECS container_definitions = jsonencode(...)) and a computed name are not read. The address space ignores these names (writtenIn reads only references written as code), and the one Terraform facts assertion that every reference is a configured path now holds for references written as code. A resource runs code only by the board rule (2b), because its archive or image names no directory; a value reaches what configuration.reached gives for the reference at its line, through variables, module arguments, outputs and locals. ownershipIn is exported from terraform-evidence.ts for this.
10. Kubernetes: the adapter already gave an environment reference and the configured path to the Service at the same line (the env item's line), and envFrom as an import that passes names on. A workload that a part binds by its address runs the code of the parts drawn inside it. A value that names a Service reaches the parts bound to the Service (symbol or file), else the workloads its selector picks (kubernetesLinks), as kubernetes-evidence.ts does. A name envFrom passes on is set where the ConfigMap sets the key (prefix applied), and reaches the Service that key's value names. A Secret's names are set, never read.
11. One target rule for every reader: a value reaches the parts whose code the named declaration runs (its compose build, else the parts drawn inside a part bound to it by symbol), else the parts that own it.

Real project (awesome-compose 30f4b7f and testdriven.io fastapi-tdd-docker 16433b6, cloned to scratch, temporary vault, real checkCode: 194 ms cold, 125 to 129 ms warm):
- awesome-compose has no sample whose code reads an address from the environment in a language the check parses: the readers are JavaScript (react-express-mysql backend/src/config.js reads DATABASE_HOST, set to db), Java, Rust, or nginx templates through envsubst. JavaScript is text, so the board of react-express-mysql is skipped as text-only. The Python samples read only FLASK_SERVER_PORT and write hosts in code (mongo:27017).
- fastapi-tdd-docker: project/app/db.py:12 reads DATABASE_URL; docker-compose.yml:13 sets it for web (build ./project) to web-db (build ./project/db, a deeper build). DB setup -> Database supported by the two pieces; without that relationship, RELATIONSHIP_UNDRAWN (warning) on Database with db.py:12 and docker-compose.yml:13. API routes -> Database: RELATIONSHIP_UNSUPPORTED, missing code, evidence docker-compose.yml:13 DATABASE_URL and :14 DATABASE_TEST_URL. Each is right: the routes reach the database through the ORM db.py sets up.
- Dogfood vault (in-process checkCode on the working tree): no finding changed; no compose file, and no relationship is unsupported.

Closing: Archboard server@TASK-367.23 branched at v137 from JFK9gI14 (TASK-367.19, current); the Code check description restated (the join, missing on an unsupported network hop; existing clauses compressed to stay under 2,000 characters). compare: 1 part changed. check --code with and without --variant TASK-367.23: no line differs, no finding on Code check. Footprint against base 96ad25faa: namedAndChanged Code check; changedNotNamed Code facts (5431eb4ea adds a compose service's build directory to its definition, edb7d34d9 the Terraform environment names; both inside the adapters, and the description's 'environment and event names count' stays true; 52c0d4500 and 8ca30b732 are TASK-367.19 and TASK-367.20). Adopted at v140. ./bin/dogfood check: no diagnostics. Behind lists none of this task's commits.
The vault file is NOT committed by this task: it also holds TASK-367.19's uncommitted adoption (JFK9gI14), which this adoption builds on, and the TASK-367.27 layout draft, so it must be committed whole by whoever closes those.

Scratch incident: the shared scratchpad's trial/ and head/ directories belong to sibling agents. My first trial run wrote two boards into trial/vault and replaced trial/repos.json (its run.ts rewrites that file on each run); I moved my boards out. I removed and recreated head/ twice before seeing a sibling uses it; later work used t23-* names.

Gate (lanes one at a time, working tree holding other agents' uncommitted C, C#, Swift, Kubernetes-closing and layout work): lint exit 1 only in others' files (evidence.ts targetReached, csharp-adapter/resolution, c-definitions, lookup, include-scope, swift-resolution); lint:tests clean. fmt:check exit 1 only on c-definitions, csharp-adapter, csharp-preprocessor, csharp-resolution, definition-site, swift-definitions. type-check exit 1 only in csharp-adapter.ts. build:frontend 0. test:modules 4215 pass 5 fail: csharp-facts (2), c-facts (2), wide-boards first-layout timing (1). test:system 195/0. test:repository 20/0. test:serial-browser exit 0. Each commit was verified on a HEAD export plus only this task's hunks: tsc clean, oxfmt and both lint configs clean on the touched files, code-check and code-facts owners 121/0 with --isolate.

Correction to the closing: the vault file at version 140, with TASK-367.23 current on Archboard server, was committed in 7b3e6ae13 (TASK-367.19's closing commit, which carried the whole file).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
check --code now joins code and infrastructure across a network hop. Where code reads an environment value and a compose service, Kubernetes workload or Terraform resource that runs that code sets the value to another part's address, the relationship between the two parts is supported as a configured path, cited at the read and at the setting. Where the infrastructure leaves a choice (several parts behind one address, several runners of one directory), the piece is a candidate, not a resolved warning. A network hop with no evidence is unsupported, and one with evidence on only one side names the missing side (code or infrastructure). Only names reach evidence, never a value. The independent review fixed false resolved warnings and a lookup that took 499 s on a large repository (now under 1 s). Owner: network-hop.test.ts and terraform-environment.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
