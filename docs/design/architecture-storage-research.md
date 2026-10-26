# Storage for shared architecture

Research for TASK-543, consulted on 2026-10-25. The owner prioritizes a hosted
Archboard and prefers DoltgreSQL over MySQL-compatible Dolt. This report
recommends experiments. It does not adopt a database or change shipped behavior.

The [discovery and interaction direction](architecture-discovery-and-interaction.md)
defines the product that storage must support. The existing semantic model is
sound. Modules, containment, relationships, flows, explanations, and proposals
remain. The problem is duplicated ownership across boards and flat JSON files.

Deployment scope clarified on 2026-10-26: prove the complete system locally
before moving board storage and frontend hosting to Scaleway Kapsule.
Rendering stays local or runs in the client. Agents stay machine-local, and
the hosted service contains no repository checkouts.
The [deployment boundary](architecture-discovery-and-interaction.md#local-operation-and-hosted-boundary)
records this direction. The selected engine must run locally. Managed offerings
remain useful comparisons rather than required dependencies.

## Recommendation

Evaluate DoltgreSQL first, TerminusDB as the competing versioned graph, and
hosted PostgreSQL as the operational control. DoltgreSQL supplies native data
branches and merges through a familiar protocol. TerminusDB combines graph
queries with versioned documents. PostgreSQL supplies an established hosted
foundation, but Archboard must own its proposal storage and merge behavior.

Fluree is the most relevant additional discovery. Its current Rust engine
exposes real graph branches, differences, and merges. It deserves a smaller
experiment if TerminusDB fails a required case or its hosting is unsuitable.
Its recent engine and commercial-license boundary require separate assessment.

Keep Neo4j Aura as the graph-query control if repeated traversal dominates the
workload. Native graph storage alone does not remove proposal history or
reconciliation work. Choosing it first trades easier graph queries for more
application-owned versioning.

No production winner is established. This investigation includes one small
DoltgreSQL functional experiment, source inspection, and current documentation.
It includes no comparable performance benchmark, production recovery exercise,
or hosted tenant-isolation test.

## What storage must preserve

Canonical means one authoritative definition per architectural subject.
Readings reference those definitions. A subject keeps its identity when it is
renamed, moved within containment, or carried into a proposal.

The model contains several distinct structures:

- Containment forms a forest: each subject has at most one structural parent,
  and parent chains contain no cycle.
- Relationships form a directed graph that can contain cycles. Kind, label,
  evidence, and other semantic fields remain available.
- Flows carry ordered messages, decisions, and loops over shared subjects.
  Dependencies alone do not supply execution order.
- Proposal ancestry connects architectural states. Competing changes need a
  common base, explicit conflicts, and reproducible historical readings.
- Groups gather concerns across containment. Appearance in a group or reading
  does not create another structural parent.

These are existing concepts, not features that a database gets to redefine.
Their authorities include [semantic subjects](../../packages/board/src/shared/schemas/content.ts),
[flows](../../packages/board/src/shared/schemas/views.ts), and
[reconciliation](../../packages/board/src/shared/rules/reconcile/variant.ts).

Storage must support a few concrete operations:

| Operation                   | Required outcome                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Open a module               | Read immediate children and relevant outside connections at one architectural state.                 |
| Focus a selection           | Query canonical subjects without creating another ownership unit.                                    |
| Compare proposals           | Report semantic changes by stable identity against an explicit base or target.                       |
| Accept a change             | Commit all affected subjects, relationships, flows, and revision metadata together.                  |
| Coordinate agents           | Refuse stale intent and prevent one proposal from publishing another agent's work.                   |
| Reproduce an explanation    | Resolve the same architecture and its evidence after later edits.                                    |
| Serve separate customers    | Deny cross-tenant access through current data, history, differences, exports, and branch operations. |
| Recover or leave a provider | Restore history and access rules, and export portable architectural meaning.                         |

A tenant is a customer with isolated data. Tenant boundaries and proposal
branches are different concepts. Putting two customers on different branches
does not establish isolation.

## What versioning means

Several products advertise history or branches, but the guarantees differ:

| Capability           | What it supplies                                                    | Missing guarantee for Archboard                                     |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A transaction        | A set of writes succeeds or fails together.                         | Persistent alternative proposals and semantic history.              |
| Historical querying  | A reading of an earlier recorded state.                             | Independent, writable futures from the same base.                   |
| Bitemporal history   | Effective time and the time a fact entered the database.            | Proposal ancestry and three-way merge.                              |
| A database clone     | An isolated development environment.                                | Merging divergent architectural records back into a shared model.   |
| Native data branches | Persistent states with ancestry, comparisons, and merge operations. | Architectural conflict rules and publication policy.                |
| Merkle storage       | Content-addressed objects with reusable unchanged structure.        | Subject identity, query indexes, authorization, and semantic merge. |

Content addressing identifies a stored value by its hash. A subject ID still
identifies the architectural part across its changing values. Merkle references
form an acyclic structure, while architectural dependencies can cycle. A
snapshot can map stable IDs to immutable record versions without hashing
dependency cycles recursively. This is a possible storage design, not a
requirement to build another database engine.
[Merkle structures](https://docs.ipfs.tech/concepts/merkle-dag/).

Native version control also does not automatically reproduce today's parent
edit propagation through draft descendants. Archboard must map its existing
inheritance, reconciliation, and adoption rules onto the selected engine.
Database row differences need interpretation before they become semantic
change marks in a picture.

## Candidate map

Each focused report below cites primary documentation, releases, source, and
licenses. "Application-owned" means that this research established no native
workflow for durable proposals with three-way data merge.
Row-level security (RLS) restricts which rows a database user can access.

| Candidate                              | Graph reading                                                   | Proposal history                                                    | Hosted fit and principal limit                                                                      | Position                              |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| DoltgreSQL 1.4.0                       | Recursive SQL and ordinary relational indexes                   | Native data branches, commits, differences, and merges              | Managed deployment exists. RLS is absent and branch reads are not isolated.                         | First experiment                      |
| TerminusDB 12.0.8                      | Typed graph documents, WOQL paths, GraphQL                      | Native immutable layers and version-control operations              | Self-hosting is available. Current managed cloud is early access.                                   | Competing versioned graph             |
| Fluree 4.2.4                           | RDF graph queries and schema/policy machinery                   | Native content-addressed commits, branches, differences, and merges | Hosted offer exists. Low-level API availability and license scope need proof.                       | Smaller emerging experiment           |
| PostgreSQL, including Neon or Supabase | Recursive SQL, joins, indexes                                   | Application-owned                                                   | Strong hosted choices and established RLS. Revision storage and semantic merge remain product work. | Operational control                   |
| Neo4j Aura                             | Native property graph and Cypher                                | Application-owned                                                   | Managed service with paid isolation and availability features. Proposal logic remains product work. | Graph-query control                   |
| SurrealDB 3.3.4                        | Native graph paths plus documents                               | Application-owned. Temporal reads are separate.                     | Managed clusters and live queries exist. Temporal availability and retention vary.                  | Conditional challenger                |
| Apache AGE                             | Cypher inside PostgreSQL                                        | Application-owned                                                   | Extension availability and authorization need provider-specific proof.                              | Add only for demonstrated query value |
| Memgraph                               | Native Cypher and graph algorithms                              | Application-owned                                                   | Production SaaS rights and commercial terms need resolution.                                        | Conditional commercial option         |
| FalkorDB                               | Native graph queries                                            | Application-owned                                                   | Individual queries are atomic. Multi-statement semantic edits lack a server transaction.            | Defer as primary authority            |
| Amazon Neptune                         | Managed property graph or RDF                                   | Application-owned                                                   | Strong AWS operating path, with AWS coupling and proposal work.                                     | Conditional AWS option                |
| XTDB 2.2.0                             | Temporal SQL without recursive CTE support in current reference | Application-owned                                                   | Useful bitemporal storage. Recursive scope queries and proposals add work.                          | Defer for this workload               |
| Datomic                                | Immutable facts and Datalog                                     | Historical and speculative states, not native proposal branches     | JVM integration and application-owned proposals.                                                    | Reference alternative                 |
| LadybugDB                              | Embedded graph queries                                          | Application-owned                                                   | Active Kuzu continuation. Hosted tenancy and operations remain application work.                    | Embedded experiment only              |

Source reports: [DoltgreSQL](architecture-storage/doltgresql.md),
[native graph databases](architecture-storage/graph-databases.md),
[versioned and temporal databases](architecture-storage/versioned-and-temporal.md),
and [relational and multimodel databases](architecture-storage/relational-and-multimodel.md).

## Why DoltgreSQL leads the experiment

DoltgreSQL directly addresses the work that otherwise remains in Archboard:
branches over canonical data, historical reads, differences, and merge conflicts.
Its PostgreSQL protocol is useful for the existing TypeScript/Bun server. It
is an independent engine, not PostgreSQL with a versioning extension.

Version 1.0 arrived on 2026-08-06, with compatibility commitments for its 1.x
storage and version-control interfaces. The examined release is 1.4.0 from
2026-10-01. Older pages that call it pre-alpha are stale evidence. The recent
release history still does not establish a long production record.
[1.0 announcement](https://www.dolthub.com/blog/2026-08-06-doltgres-1-0/),
[1.4.0 release](https://github.com/dolthub/doltgresql/releases/tag/v1.4.0).

The source includes recursive-query tests and JSON/JSONB merge tests. The
separate [functional experiment](architecture-storage/doltgresql-smoke.md)
exercises actual traversal, branch isolation, and merge behavior on small data.
That evidence supports a prototype, not a performance or reliability claim.
[Recursive tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/with_recursive_cycle_test.go),
[merge tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/merge_test.go).

The functional run used four modules and one dependency through Bun's native
PostgreSQL client. Recursive reads and proposal isolation worked. A three-way
merge preserved independent row edits, and a competing field edit produced an
inspectable conflict. SQL constraints accepted a three-node containment cycle,
which a separate recursive query detected. No concurrent sessions or hosted
authorization paths were exercised.

The largest hosted concern is authorization. Version 1.4.0 accepts an
`ALTER TABLE` RLS form while ignoring its effect. Branch permissions cannot
prohibit branch reads. A shared tenant table protected by assumed PostgreSQL
policies is therefore not an acceptable design. Separate databases and
credentials require demonstrated denial through history and administrative
functions as well as ordinary reads.
[RLS translation](https://github.com/dolthub/doltgresql/blob/v1.4.0/server/ast/alter_table.go),
[branch permissions](https://www.doltgres.com/docs/reference/server/branch-permissions/).

SQL commits and Dolt commits are separate boundaries. Connections retain branch
state, and branch functions can introduce implicit transaction boundaries.
The prototype must prove how Archboard validates a merged architecture before
publishing it. A successful database merge must not publish a containment cycle
before the application notices it.
[Branch semantics](https://www.doltgres.com/docs/reference/version-control/branches/),
[merge semantics](https://www.doltgres.com/docs/reference/version-control/merges/).

Hosted Dolt offers Doltgres deployments, but Dolt-specific availability claims
cannot stand in for a Doltgres contract. Direct standby replication and remote
commit replication have different recovery properties. A repaired beta-era
TEXT/JSON loss incident makes independent upgrade and restore tests part of
the evaluation. It does not establish a current defect in newly written 1.4.0 data.
[Hosted offer](https://www.dolthub.com/blog/2025-02-07-hosted-doltgres/),
[replication](https://www.doltgres.com/docs/reference/server/replication/),
[incident and repair](https://www.dolthub.com/blog/2026-09-04-postgres-data-loss-post-mortem/).

## Why the graph challengers matter

TerminusDB is the closest direct alternative to a versioned relational model.
Its typed documents and references retain the current semantics, while graph
queries express scope and dependency traversal. Its immutable storage and
branch operations address proposal history. The project is active, but current
managed hosting is explicitly early access. Merge semantics and stale-write
behavior need hands-on evidence.
[Release](https://github.com/terminusdb/terminusdb/releases/tag/v12.0.8),
[version control](https://terminusdb.com/docs/version-control-operations/),
[hosting](https://terminusdb.com/docs/cloud/).

Fluree offers another combination of graph queries and native revisions. Its
current branch interface has concrete difference and merge operations. The
default `take-both` strategy is unsuitable for blindly accepting competing
parent relationships. The pinned license includes an application exemption,
but the exact hosted use must fit that exemption. This is a narrower experiment
than adopting its entire knowledge-graph or AI platform.
[Branch interface](https://labs.flur.ee/docs/db/cli/branch),
[pinned license](https://github.com/fluree/db/blob/v4.2.4/LICENSE).

Neo4j becomes attractive if graph patterns make SQL cumbersome or expensive.
It does not remove the need to resolve which versions of subjects and edges
belong to a proposal. Traversing raw historical edges without that resolution
can resurrect deleted relationships. A graph engine needs the same coherent
state contract as a relational engine.
[Graph model and traversal](https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/).

## Other technologies screened

TypeDB offers typed entities, relations, constraints, and a managed cloud.
Its repository release API reports 3.14.1 from 2026-10-22. These capabilities
are relevant to semantic modeling, but the consulted material does not establish
durable proposal branching and merging. Its edition table lists some access
control facilities as planned. Keep it behind the shortlist until it removes
more required product work than the additional query model introduces.
[Model](https://typedb.com/docs/home/),
[editions](https://typedb.com/editions),
[release](https://github.com/typedb/typedb/releases/tag/3.14.1).

Gel offers a relational model with explicit links and a branch workflow. Its
branches map to PostgreSQL databases. Its documented rebase copies main data
and reapplies schema migrations. That does not establish three-way merging of
divergent architectural records. Gel is an application-development alternative,
not evidence that the proposal problem disappears.
[Branch model](https://docs.geldata.com/reference/datamodel/branches),
[migration workflow](https://docs.geldata.com/resources/guides/migrations/guide).

CozoDB combines relational graph queries, Datalog, and opt-in historical
validity. Its latest published release remains 0.7.6 from 2023-12-11. The
repository is not archived, but that release age raises maintenance questions.
Time travel alone does not supply proposal merges. New forks need their own
maintenance and operating assessment.
[Project](https://github.com/cozodb/cozo),
[release](https://github.com/cozodb/cozo/releases/tag/v0.7.6).

Kuzu is archived. LadybugDB is an active continuation with a 0.22.0 release
on 2026-10-25. It is relevant to embedded graph workloads, but is not a
demonstrated substitute for hosted revision, tenant, and recovery contracts.
[Kuzu](https://github.com/kuzudb/kuzu),
[LadybugDB releases](https://github.com/LadybugDB/ladybug/releases).

SQLite remains a possible local store or control fixture. The selected engine
must support local operation and the eventual hosted service. A small local
installation alone does not decide the recommendation. No synchronization
engine or general conflict-free data structure automatically settles
architectural conflicts either.

## Hosted costs and operating boundaries

Published entry prices are not comparable production quotes. Some buy one
small instance. Others include replicas, access-control features, or a cloud
service layer. The supporting reports record prices and their sources as
consulted, with exclusions and unknowns.

The same workload must determine each estimate:

- Tenant count and whether isolation requires separate databases or deployments.
- Active proposals, retained revisions, and the fraction of data changed per proposal.
- Concurrent agent writes and the rate of interactive scope queries.
- Backups, recovery objectives, replicas, storage, and network transfer.
- Required access-control and availability editions.

For DoltgreSQL, database-per-tenant isolation can change the economics of native
branching. For Aura, stronger isolation and availability can require a higher
edition. For TerminusDB and Fluree, a hosting offer does not establish that all
required branch APIs and exports are available through that offer.

The Archboard server remains the write authority. Readers and agents receive
authorized operations rather than unrestricted database credentials. Claims
describe who is working. Transactions and expected revisions protect committed
state. A long agent task does not hold a database transaction open.

## Common experiment and stopping rules

Use one canonical authored fixture for every candidate. Start with 1,000
subjects, then 10,000 and 100,000. Use roughly five relationships per subject,
containment depth up to 12, cycles, groups, and ordered flows with decisions.
Exercise 20 sparse proposals first, then 100. These are test sizes, not forecasts.

Every implementation must pass the same cases:

1. Open one shared subject from two scopes and retain its identity after rename
   and reparenting.
2. Read immediate children, callers, outgoing dependencies, and aggregated
   hidden-descendant relationships at an explicit revision.
3. Branch two proposals, merge independent edits, expose conflicting edits, and
   retain a reproducible common base.
4. Combine edits that individually pass but jointly create a containment cycle.
   Refuse publication of the invalid result.
5. Combine endpoint deletion with a new relationship, and competing changes to
   flow order. Preserve explicit architectural conflict outcomes.
6. Run concurrent writers, stale writes, and a lost-response retry. Prevent
   silent overwrite, duplicate intent, and publication of another writer's work.
7. Attempt cross-tenant reads through current state, history, differences,
   branches, exports, and subscriptions. Require denial on every surface.
8. Restore a backup after termination and after an engine upgrade. Recover
   proposals, history, evidence, and access controls together.
9. Export the semantic model and read it independently of the selected engine.
   Preserve subject identities and historical references.

Record query correctness, p50/p95 delay, round trips, bytes, storage growth,
and the application code required. Separate database delay from scene layout
and frontend interaction. The p95 value is the delay that 95 percent of requests
do not exceed. Record cold and warm reads. No latency target is accepted yet.
A database p95 of 100 ms is a provisional experiment target.

Reject a candidate if invalid merged meaning becomes visible before validation,
if tenant denial fails, or if source compatibility silently disables a required
guarantee. A vendor benchmark cannot waive these cases.

## Migration and decision boundary

Changing engines does not reconcile duplicated board subjects. The migration
needs an explicit mapping from existing board-local references to canonical
subjects. Shared code bindings provide evidence, not proof of identical meaning.
Historical references and competing descriptions need preservation or deliberate
resolution. Do not regenerate identities because content or storage changes.

The existing Zod contracts and semantic rules remain the input authority while
storage changes underneath them. Agent actions continue to name architectural
subjects. Database-specific SQL, branch names, and internal identifiers do not
become concepts that readers must manage.

One successful read path is insufficient. The next decision needs local evidence
from the complete proposal lifecycle and the isolation and recovery cases that
the eventual hosted service must satisfy.
Choose the engine that removes the most required application and operating
work while preserving those contracts.
