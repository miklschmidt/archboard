# Native graph databases for hosted Archboard

Research for TASK-543. Sources consulted 2026-10-25. This compares current
primary documentation, source and published prices. It includes no benchmark or
operational trial. Vendor performance claims are not established results.

## Finding and shortlist

Neo4j AuraDB is the strongest native graph baseline to evaluate. Neptune is a
conditional AWS alternative. Neither supplies Archboard's proposal model.
Memgraph remains conditional on commercial SaaS terms and operational cost.
FalkorDB has a more restrictive transaction boundary that weakens its fit as the
authoritative store. These judgments concern replacing board/JSON ownership.

They preserve the [agreed product direction](../architecture-discovery-and-interaction.md).

| Candidate               | Position                          | Disqualifier or condition                                                                                                            |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Neo4j / AuraDB          | First native graph proof          | Application-owned history and merging must be acceptable. Budget for the security/availability tier required.                        |
| Amazon Neptune Database | Second, for an AWS-hosted product | If self-hosting, built-in tenant graph authorization, or richer schema constraints are required, reject it.                          |
| Memgraph                | Conditional                       | Obtain hosted Archboard rights and a production quote. Justify memory and cluster operations.                                        |
| FalkorDB                | Conditional primary authority     | If a logical write needs several independently constructed statements with rollback, reject it. Resolve SSPL/commercial terms first. |

This is not evidence that graph storage beats a versioned relational store.
Traversal convenience and revision management are separate decision axes.

## What graph storage changes

The retained model fits a property graph. It has stable subjects with
responsibilities, kinds and bindings. Its relationships include containment and
cyclic typed dependencies. It also retains concern groups and separately authored flows.

All four engines
offer graph pattern/traversal languages. Neo4j and Memgraph use Cypher.
FalkorDB implements openCypher with extensions. Neptune supports openCypher and
Gremlin over its property graph, plus RDF/SPARQL as a separate model. Query
compatibility needs verification, rather than assuming every Cypher implementation
has Neo4j's features. [Neo4j driver/manual](https://neo4j.com/docs/javascript-manual/current/),
[Memgraph Cypher differences](https://memgraph.com/docs/querying/differences-in-cypher-implementations),
[FalkorDB model](https://docs.falkordb.com/),
[Neptune languages](https://aws.amazon.com/documentation-overview/neptune/).

For Archboard, this can make opening a module, tracing callers through hidden
descendants and assembling a focused reading direct graph queries. That is an
inference from the model, not a measured latency improvement. A dependency cycle
must remain legal while a containment cycle must fail. A graph engine does not
infer that distinction, enforce one structural parent, or invent sequence order
from dependency edges. Flow steps, conditions, loop targets and participant
references remain authored domain data.

The proposed storage boundary is one tenant graph per architectural domain.
It replaces separate graphs per board. A reading references canonical subjects at an explicit
architectural revision. Storing repeated appearances as independent graph nodes
reproduces the ownership problem under a different database name.

## Native traversal does not mean native version control

No evaluated product documents a built-in combination of per-user architectural
proposals, inexpensive logical branches, pinned historical traversals, semantic
diffs and three-way merges. This is a documentation finding, not proof that an
extension can never provide it. Neo4j's own versioning guide describes explicit
entity/state nodes and validity intervals that the application models, including
their duplication and query costs. [Neo4j versioning patterns](https://neo4j.com/docs/getting-started/data-modeling/versioning/).

| Engine facility                            | What it actually supplies                                           | Missing proposal behavior                                                  |
| ------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Neo4j modeled states and Aura backups/PITR | Application-defined versions and operational recovery               | Branch ancestry, merge base, conflicts and acceptance.                     |
| Memgraph MVCC, snapshots and WAL           | Transaction isolation and restart/recovery data                     | Durable user-addressable revisions and branches.                           |
| FalkorDB `GRAPH.COPY`                      | A consistent complete graph copy, including indexes and constraints | Shared logical history, delta storage guarantees, semantic diff and merge. |
| Neptune copy-on-write clones and PITR      | Storage-efficient cluster copies and recovery                       | User proposal identity, field conflicts and merge into another branch.     |

The operational facilities are documented in [Aura pricing/features](https://neo4j.com/pricing/),
[Memgraph recovery](https://memgraph.com/docs/database-management/backup-and-restore),
[FalkorDB copy source](https://raw.githubusercontent.com/FalkorDB/docs/docs-site/commands/graph.copy.mdx)
and [Neptune cloning](https://docs.aws.amazon.com/neptune/latest/userguide/manage-console-cloning.html).
Neptune's clones share unchanged pages, but require cluster/instance provisioning,
are region-bound and have a documented limit of 15 clones per cluster copy.
That is useful for testing. It is a poor default for every person's proposal.

Archboard must therefore own commit ancestry, proposal heads, immutable accepted
states, evidence revisions, diffs, conflict detection and merge policy. An
immutable state graph or proposal overlays can share unchanged subjects, but
their query costs and correctness are unproven. Every traversal must resolve
containment, relationships and flow participants in the same state. Comparing
stable subject IDs is straightforward conceptually. Resolving concurrent moves,
delete-versus-edit and flow-order changes is product logic. Cypher `MERGE` is an
upsert/pattern operation, not a three-way branch merge.

## Neo4j and AuraDB

Neo4j has the richest documented integrity surface here: composite uniqueness
on nodes and relationships, and Enterprise existence, type and key constraints.
Recent documentation matters: graph types became generally available in
2026.06, with relationship endpoint-label constraints as well as property
rules. They are open schemas, so unspecified elements remain unconstrained.
The documented facilities still leave containment acyclicity and parent
cardinality to the application. [Constraints](https://neo4j.com/docs/cypher-manual/current/schema/syntax/),
[graph types](https://neo4j.com/docs/cypher-manual/current/schema/graph-types/),
[endpoint constraints](https://neo4j.com/docs/cypher-manual/current/schema/graph-types/set-graph-types/).

Multi-statement transactions are appropriate for a whole semantic edit, but the
default isolation is read committed. The operations manual explicitly
discusses anomalies and explicit locking to obtain stronger behavior. Archboard
must serialize validation and commit against a revision/head record. Independently
checking for a parent or cycle before writing is insufficient under concurrency.
[Concurrency](https://neo4j.com/docs/operations-manual/current/database-internals/concurrent-data-access/).

The official JavaScript driver supplies transactional access and is documented
for TypeScript applications. Bun compatibility remains untested here.
[Concurrency](https://neo4j.com/docs/operations-manual/current/database-internals/concurrent-data-access/),
[transaction API](https://neo4j.com/docs/javascript-manual/current/transactions/),
[TypeScript access](https://neo4j.com/docs/getting-started/languages-guides/).

Aura offers managed AWS, Azure and Google Cloud hosting. Professional has daily
backups retained seven days, but its single database and lack of fine-grained
RBAC mean shared tenants depend on application authorization. Business Critical
adds multiple databases, fine-grained access controls, multi-zone HA, a published
99.95% SLA, and 30-day backups with hourly PITR. VDC adds dedicated infrastructure
and private networking options. These are vendor service commitments, not
independently tested availability. [Tier comparison](https://neo4j.com/pricing/).

Community is GPLv3. Enterprise adds closed-source commercially licensed
components. Self-hosting Community therefore does not reproduce Aura's enterprise
security/HA. Current commercial terms grant internal business use and impose
order-specific restrictions.
[Repository licensing](https://github.com/neo4j/neo4j),
[commercial software agreement](https://neo4j.com/legal-terms/software-agreement/).

Obtain terms that cover Archboard's hosted service
and any redistribution. Do not treat a developer license as production rights.
[Repository licensing](https://github.com/neo4j/neo4j),
[commercial software agreement](https://neo4j.com/legal-terms/software-agreement/).

Assessment: the best documented mix of query tooling, constraints, driver support
and managed operations. Its maturity is supported by maintained production
documentation and current schema releases, rather than a comparative reliability
test. The main remaining engineering project is a versioned domain model.

## Memgraph

Memgraph supports explicit ACID transactions with default snapshot isolation.
Its isolation matrix explicitly does not prevent every serializability anomaly.
An optimistic head update/common write conflict is still needed around
cross-subject invariants. Use transactional mode: the analytical mode deliberately
relaxes ACID guarantees. [Transactions](https://memgraph.com/docs/fundamentals/transactions).

The default stores the graph in memory with snapshots
and WAL. An on-disk transactional mode also exists. Memgraph is not exclusively
memory-only. [Transactions](https://memgraph.com/docs/fundamentals/transactions),
[storage modes](https://memgraph.com/docs/fundamentals/storage-memory-usage).

Documented constraints include node property existence, composite uniqueness
and types. They help protect identity and required fields but do not implement
the whole containment/flow contract. Node.js access uses the Neo4j driver over
Bolt. This gives a familiar TypeScript integration route without guaranteeing
complete Neo4j behavior. [Constraints](https://memgraph.com/docs/fundamentals/constraints),
[Node client](https://memgraph.com/docs/client-libraries/nodejs).

Enterprise multi-tenancy supplies separate databases, per-database durable
directories and access controls. Databases share CPU. Tenant profiles can cap
RAM. New principals have default access to the `memgraph` database unless revoked,
which matters for provisioning.
[Tenant isolation](https://memgraph.com/docs/database-management/multi-tenancy).

Automatic failover is an Enterprise facility.
Self-managed deployments own cluster operations and external snapshot/WAL backup
copies. [Tenant isolation](https://memgraph.com/docs/database-management/multi-tenancy),
[HA](https://memgraph.com/docs/database-management/clustering/high-availability),
[backup procedure](https://memgraph.com/docs/database-management/backup-and-restore).

The current Community license is BSL, not permissive open source, despite
marketing wording. Its January 2026 additional grant limits production to
authorized internal business use and excludes DBaaS/equivalent and competing
solutions. The pricing page explicitly offers an OEM/SaaS agreement for embedding
in a hosted product. Hosted Archboard rights must be established commercially.
This report does not resolve the legal meaning of a particular deployment.
[Actual BSL](https://github.com/memgraph/memgraph/blob/master/licenses/BSL.txt),
[OEM/SaaS offer](https://memgraph.com/pricing).

Memgraph Cloud is positioned for prototyping and early-stage projects. Production
managed service terms require discussion. Enterprise prices scale with memory
capacity, with no published numeric floor on the consulted pricing page. Current
release notes list v3.14.0 on October 21, 2026. They establish active maintenance.
[Pricing](https://memgraph.com/pricing), [maintenance](https://memgraph.com/docs/release-notes).

There is no benchmark here demonstrating that its memory-oriented execution
justifies the hosting and licensing costs for Archboard.

## FalkorDB

FalkorDB stores property graphs as sparse adjacency matrices and queries them
with openCypher. Mandatory and unique constraints cover both nodes and
relationships. Constraint creation returns before enforcement finishes. A
migration must wait for `OPERATIONAL` rather than accepting `PENDING` as success.
The current limitations also document an edge-multiplicity query pitfall when a
relationship alias is not otherwise referenced. [Engine model](https://docs.falkordb.com/),
[constraints](https://docs.falkordb.com/commands/graph.constraint-create),
[query limitation](https://docs.falkordb.com/cypher/known-limitations).

One FalkorDB query is atomic. Core source
rolls back its changes if that query fails. The server lacks multi-statement
ACID transactions, according to FalkorDB's ORM documentation. Its session sends
individually committed queries. Session rollback cannot undo queries already sent.
[Vendor transaction documentation](https://raw.githubusercontent.com/FalkorDB/falkordb-py-orm/main/docs/transactions.rst),
[query rollback source](https://raw.githubusercontent.com/FalkorDB/FalkorDB/master/src/commands/cmd_query.c).

Do not confuse a client `MULTI/EXEC` wrapper with rollback across an entire batch.
Archboard must express a complete edit and validation in one query or build
staging/publication machinery. FalkorDB remains a possible primary store if that
boundary fits the write contract. If a semantic write requires several statements
that must roll back together, reject it.

Graph-key ACL patterns can isolate tenants and read/write privileges. Replication
is single-primary and asynchronous. Replicas can lag, and automatic promotion
requires Sentinel or cluster setup. Self-hosters configure RDB/AOF persistence.
The official TypeScript client is available. [ACL](https://docs.falkordb.com/commands/acl),
[replication](https://docs.falkordb.com/operations/replication),
[persistence](https://docs.falkordb.com/operations/durability/persistence),
[TypeScript client](https://github.com/FalkorDB/falkordb-ts).

Core licensing is SSPLv1. Section 13 imposes service-source obligations when
covered functionality is offered as a service. FalkorDB's FAQ interprets this
broadly for externally offered services. Do not assume a proprietary hosted
product is covered without commercial terms.
[License text](https://github.com/FalkorDB/FalkorDB/blob/master/LICENSE.txt),
[vendor interpretation](https://docs.falkordb.com/references/license).

Releases include v6.0.3 on October 22, 2026. They show active development.
RedisGraph's retirement does not describe FalkorDB's maintenance status.
[releases](https://github.com/FalkorDB/FalkorDB/releases).

## Amazon Neptune Database

Neptune offers managed graph transactions and AWS operations, but only native
node/edge ID uniqueness as a schema constraint. Additional field constraints
and tenant separation inside its single graph are application responsibilities.
Separate tenant clusters supply a stronger isolation boundary at a substantial
resource/provisioning cost. IAM restricts actions/query languages. It is not
tenant-property row-level authorization. [Compatibility and tenancy contract](https://docs.aws.amazon.com/neptune/latest/userguide/migration-compatibility.html),
[cluster-per-tenant guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/multi-tenancy-amazon-neptune/silo-model.html).

Read-only queries use snapshot isolation. Mutation reads use read committed with
record/range locks that prevent non-repeatable and phantom reads. OpenCypher
Bolt read/write sessions support a transaction boundary. Reads requiring a just
committed change must use the writer because replicas can lag. Retries must
handle contention without repeating external side effects. [Isolation contract](https://docs.aws.amazon.com/neptune/latest/userguide/transactions-neptune.html).

Neptune runs within AWS VPCs and requires TLS. Multi-AZ storage, reader failover
and continuous incremental backups with 1–35-day restore retention are operational
strengths. They do not supply historical subject queries in the live database.
TypeScript can use AWS SDK v3's Neptune Data client/parameterized openCypher API,
or compatible Bolt access. Make sure that the chosen engine and client support the required features.
[Network restrictions](https://docs.aws.amazon.com/neptune/latest/userguide/limits.html),
[storage](https://docs.aws.amazon.com/neptune/latest/userguide/feature-overview-storage.html),
[backups](https://docs.aws.amazon.com/neptune/latest/userguide/backup-restore.html),
[SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/neptunedata/),
[query API](https://docs.aws.amazon.com/neptune/latest/data-api/API_ExecuteOpenCypherQuery.html).

It is a proprietary AWS service. No self-hosted engine offering is documented. AWS
publishes active engine releases and lifecycle dates. Choose it when AWS
integration and managed durability outweigh portability, schema and isolation
work. Reject it as a route to native proposal merging.
[Service overview](https://aws.amazon.com/documentation-overview/neptune/),
[release lifecycle](https://docs.aws.amazon.com/neptune/latest/userguide/engine-releases.html).

## Published cost floors

USD, excluding taxes and application hosting. Monthly arithmetic uses 730 hours.
These are starting prices, not workload estimates or tenant-by-tenant budgets.

| Service                | Published floor/model                                                                        | Production consequence                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Aura Professional      | $0.09/GB-hour, minimum 1 GB: about $65.70/month                                              | Lower-cost shared application-authorized deployment.                                                                |
| Aura Business Critical | $0.20/GB-hour, minimum 2 GB: about $292/month                                                | Entry to the listed multi-database/auth/HA facilities.                                                              |
| Memgraph               | Free Community. Commercial pricing by memory, numeric floor unknown.                         | Request OEM/SaaS and production managed quote.                                                                      |
| FalkorDB Cloud         | Startup from $73/1 GB/month. Pro from $350/8 GB/month                                        | Startup lacks HA/continuous persistence. Pro lists multi-zone HA and 12-hour backups.                               |
| Neptune                | Provisioned instance-hours or serverless NCU-seconds, plus storage/I/O/extra backup/transfer | Serverless minimum is 1 NCU per instance. It does not scale to zero. Numeric regional minimum not established here. |

Sources: [Aura](https://neo4j.com/pricing/), [Memgraph](https://memgraph.com/pricing),
[FalkorDB](https://www.falkordb.com/plans/), [Neptune billing](https://aws.amazon.com/neptune/pricing/),
[Neptune minimum capacity](https://docs.aws.amazon.com/neptune/latest/userguide/neptune-serverless-capacity-scaling.html).
AWS's published US East example prices `db.r5.large` at $0.348/hour, storage at
$0.10/GB-month and I/O at $0.20/million. That example is not the smallest
available instance or a current EU quote. Additional HA readers add compute cost.

## Embedded status and next evidence

Kuzu's official repository was archived on 2025-10-10. Existing binaries
remaining usable is not ongoing maintenance. LadybugDB is an active MIT-licensed
embedded successor/fork. Its releases show v0.22.0 on 2026-10-25, and its
repository advertises serializable ACID transactions and Node bindings. This
corrects stale claims that embedded graph development stopped with Kuzu.
[Kuzu archive](https://github.com/kuzudb/kuzu),
[Ladybug engine](https://github.com/LadybugDB/ladybug),
[current releases](https://github.com/LadybugDB/ladybug/releases).

Ladybug is an embedded analytical engine, not evidence of a hosted tenant service
with managed HA, authentication or branch merging. Its distributed operations and
hosted cost floor are unestablished here. If a local/embedded deployment becomes
a requirement, investigate Ladybug. Do not select an archived Kuzu build as the
hosted authority.

The smallest useful next proof is one Aura database with two concurrent proposals
over canonical subjects. Demonstrate a pinned historical reading, a recursive
module opening, cross-container relationship aggregation, and a conflicting
containment move followed by a three-way merge. Measure that complete path and
revision storage growth. Also prove tenant isolation and restore an edit family
atomically. If application-owned history makes these operations complex or slow,
native graph traversal has not paid for replacing the current ownership model.
