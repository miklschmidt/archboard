---
id: TASK-367.20
title: Code facts for docker-compose files
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 16:18'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 628000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docker-compose is the smallest infrastructure description, and many repositories run their local system with it. Its services name each other directly, so it is the easiest place to join code and infrastructure evidence first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Services, networks and volumes are definitions
- [x] #2 `depends_on`, links, and environment values that name another service are configured paths, and a shared volume is a data relationship
- [x] #3 Override files merge in the order compose uses, and an env file contributes names only, never values
- [x] #4 Parts bound to compose services get the anchor, binding and undrawn checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.20 only if the Code facts description must change (it names the adapter table; a compose adapter is one more entry), adopted at close.
1. New files in src/runtime/code-facts/lib: compose-yaml.ts (Bun.YAML.parse for meaning, a block-YAML line index for lines and spans, one layer per document), compose-adapter.ts (facts of a compose file: services, networks and volumes as definitions; depends_on, links, volumes_from, network_mode service:, networks, named volume mounts, environment values that name a service, and a shared named volume as configured-path references, each through one import per reference so the resolver decides where it leads; environment names as environment references; env_file as an import whose names the resolver fills; facts of an env file: names only), compose-project.ts (which files compose reads and merges: compose.yaml, compose.yml, docker-compose.yml, docker-compose.yaml, then the first of the override names; the per-pass resolver that merges the project in compose's order: later environment names and volume targets win, depends_on/links/networks are unions; resolves a service name, container_name, hostname or network alias; reads an env file for names only).
2. Shared hunks: one entry in adapters.ts (whole compose file names and the .env extension/name), AdapterName and Reference.kind (configured-path) in facts.ts, export of mergedDefinitions from code-facts/index.ts.
3. Code check, only for service-bound parts: a part bound to a compose service owns that service in every file of its project (part-code grain, evidence ownership, support holding); a same-file target whose definition is exactly the target is owned by its definition (evidence.ts reachedBy).
4. Tests: code-facts/tests/compose-facts.test.ts over a fixture (base, override, env file with a tempting secret, three services naming each other by depends_on and an environment URL); code-check/tests/compose-check.test.ts for the anchor, binding and undrawn checks and backwards.
5. Try on docker awesome-compose through a temporary vault; record findings in design-checks.md; authoring.md names compose service addresses as binding symbols.
6. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (9fc1db389 code facts, 40a42e9ab code check, 2535aedd5 docs, vault adoption committed after). src/runtime/code-facts gains compose-lines.ts (where each key and item of a YAML file stands: Bun.YAML.parse gives no lines), compose-model.ts (one layer per YAML document: definitions, the entries of each service, aliases), compose-adapter.ts (facts of a compose file and of an env file), compose-project.ts (which files compose reads and merges; the per-pass resolver), compose-merged.ts (mergedDefinitions, exported from code-facts/index.ts). One entry in adapters.ts (the eight compose file names and the .env extension or name), "compose" in AdapterName, and Reference.kind widened to configured-path. code-check: a symbol grain carries `merged` (the same definition in each file its tool merges with the bound file); evidence ownership and anchor holding read it; a use whose import leads to a definition of its own file under exactly the imported name is owned by that definition (targetReached). Owners: code-facts/tests/compose-facts.test.ts over fixtures/compose-shop (base, override, api.env with a tempting secret, three services naming each other by depends_on and environment URLs), code-check/tests/compose-check.test.ts.

Adapter contract: no extension was needed for "an adapter with no grammar". The TASK-367.08 reviewer's 4d782f721 already made an entry `reads: { extension or whole file name: (text) => ParsedFacts }`; compose is one entry of whole names. Two small additions: Reference.kind may be configured-path, and code-facts exports mergedDefinitions (compose-only today, generic by name).

Decisions the ADR left open:
1. Compose files: compose.yaml, compose.yml, docker-compose.yml, docker-compose.yaml (compose-go's order of preference) and the override names compose.override.yml, compose.override.yaml, docker-compose.override.yml, docker-compose.override.yaml. The project of a directory is the first base found plus the first override found, merged in that order; the documents of one file merge in their order. A file compose would not pick (docker-compose.yml beside compose.yaml) is a project of its own. compose.<x>.yaml (named for -f) is not read as compose: it merges only as a command line says, and the table names files by whole name or extension (no pattern), so it stays text.
2. Merge: depends_on, links, volumes_from, networks and env_file add up; an environment value of the same name, a volume mount at the same target and network_mode in a later layer replace the earlier entry, whose reference then stays unresolved (no evidence). A reference resolves to the first file of the project that declares its address; a container_name, hostname or network alias resolves to its service.
3. Each address reference reaches its address through an import of its own (specifier = the address, local = the reference's spelling), so the per-pass resolver (which may read other files) decides both the merge and the declaring file, inside the existing contract; the resolver rewrites the imported name for an alias. Unresolved references give no evidence.
4. Definitions: services.<name>, networks.<name>, volumes.<name>, spanning their block. Visibility: a service with ports is "published" and exposed, else "internal"; a network or volume declared external is "external" and exposed, else "internal". No exposure rule is added to module-exposure.ts.
5. Configured paths (ADR 0046 gives configured-path for all of these): depends_on, links, volumes_from, network_mode service:<name>, each network a service joins (to networks.<n>), each named volume it mounts (to volumes.<v>), an environment value whose host is a service, and a shared named volume: a mount that writes reaches every other service of the same file that mounts the volume; a read-only mount reaches only the volume (data runs from the writer to the reader). A shared volume across files of a project is not joined (facts are per file).
6. Environment values: the host comes after a scheme (also jdbc:mysql://) or a user, or before a port; a bare word counts only under a name ending in HOST(S), HOSTNAME, SERVER(S), ADDR or ADDRESS. A host with a dot, localhost, a number and a YAML boolean word (found on awesome-compose: REV_SERVER=true) are never a service. Interpolation takes the written default (${X:-api}), else nothing: the shell and the project .env are never read. Each environment name a service sets is an environment reference at its line, beside the configured path its value gives.
7. Env files: env_file entries are imports marked reexport (they pass names on); the resolver reads the file only if Git lists it and fills the import's names with the names it sets. The adapter also reads .env and <name>.env files on their own as names only (environment references), so a bound or anchored env file never holds its values in the facts. No fact keeps a value of a compose file either.
8. A file that is not YAML is one unparsed part whose names are its keys (never values).
9. Ownership across files: a part bound to compose.yaml#services.web also owns the web block of the override (the symbol grain's merged definitions), so a dependency the override adds is that part's evidence and an anchor defined there holds for it. A file binding owns only its file.
10. Not followed: extends, include (compose 2.20), !reset/!override tags, external_links, secrets/configs.

awesome-compose (30f4b7f, cloned to scratch): 39 compose files and 4 .env files read in 9 to 13 ms cold, 2 ms warm; 117 definitions, 92 configured paths all resolved, 126 environment names; no override or env_file in the samples. Temporary vault, two boards, 9 parts bound to services, networks and volumes, real checkCode in 95 ms. react-express-mysql: frontend -> backend supported by depends_on; backend -> db anchored at services.db holds; db -> volumes.db-data supported by its mount; RELATIONSHIP_UNDRAWN warning on the private network (backend and db join it, nothing drawn); RELATIONSHIP_UNSUPPORTED frontend -> db (no configuration joins them); BINDING_SYMBOL_MISSING on services.cache (planted). nginx-golang-postgres: RELATIONSHIP_BACKWARDS backend -> proxy (the proxy depends on the backend, planted); ANCHOR_SYMBOL_MISSING services.dbx (planted). Each right.

For TASK-367.23: compose facts give, per service (by line within its services.<name> span, and its merged blocks): environment references (the names it sets), configured-path references from an environment value to the service it names at the same line, and reexport imports (env_file) whose resolved names are the names an env file sets with no value. For TASK-367.19: compose-lines.ts reads lines of any block YAML and Bun.YAML.parse gives a list per multi-document file; the one-import-per-address pattern lets a resolver find the manifest that declares Kind/name; Kubernetes will read .yaml/.yml by extension and the compose whole names win over it.

Closing: Archboard server@TASK-367.20 branched at v100 (parent TASK-367.27 server entry); the Code facts description restated (adapter table reads extensions or whole names through a grammar or a Bun parser; evidence kinds include configured-path; the compose sentence). compare: 1 part changed. check --code with and without --variant TASK-367.20: no line differs, no finding on Code facts (server not restarted: the dogfood repository holds no compose or env file). Footprint against base cd6842061: namedAndChanged Code facts (9fc1db389; e8f1d0d61 is TASK-367.11); changedNotNamed Code check (40a42e9ab: ownership of a compose service across its project's files, inside the narrowest-binding rule the description states, so the board stays true; e8f1d0d61 and a9dd9c664 are TASK-367.11 and TASK-368.10). Adopted at v103; v104 restores the board's scope summary (the branch had set the task title). ./bin/dogfood check: no diagnostics. Behind lists none of this task's commits.

Gate (lanes one at a time, working tree with other agents' uncommitted work): lint exit 1 only on c-facts.test.ts (TASK-367.09, uncommitted); lint:policy exit 1 only on other agents' uncommitted files (evidence.ts max-lines from TASK-367.09's hunks, c-*, swift-*); fmt:check and type-check exit 1/2 only on nix-library.ts (TASK-367.21, uncommitted parse error); test:modules 4186 pass 2 fail (code-check.test.ts text-only skip: infra/dns.tf is now read by TASK-367.17's uncommitted Terraform adapter; a renderer first-layout timing under load); test:system 195/0; test:repository 20/0; test:serial-browser exit 0 (24 pass). On a clean copy of HEAD 1709cf70a (with this task's commits): tsc root and frontend 0, oxfmt --check clean, lint:policy and lint:tests clean, code-facts and code-check owners pass with --isolate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code check now reads docker-compose files: services, networks and volumes are definitions, and depends_on, links, volumes_from, network_mode, joined networks and volumes, environment values whose host is a service, and shared writable volumes are configured paths. Files and overrides are found and merged the way compose-go does, with every value interpolated first, and env files are read by an adapter of their own that keeps names only, never values. Parts bound to compose services get the anchor, binding, undrawn and backwards checks. Verified by compose-facts.test.ts and compose-check.test.ts (pass with --isolate, each fix mutation-checked) and on awesome-compose and 16 more real projects, where 557 of 566 configured paths resolve and every host read names a real service.
<!-- SECTION:FINAL_SUMMARY:END -->
