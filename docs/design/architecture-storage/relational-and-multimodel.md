# Relational and multimodel storage for shared architecture

Research for TASK-543. Sources consulted 2026-10-25. This note evaluates
PostgreSQL as the control, Apache AGE, managed PostgreSQL, and SurrealDB. It
does not adopt a storage design. Statements labelled assessment or proposed
design are this investigation's conclusions. Availability and performance
claims from providers remain vendor claims until tested.

## Recommendation and domain fit

Keep ordinary PostgreSQL with an explicit architecture schema and immutable
revisions on the shortlist. It separates graph queries from the harder question of which architectural
state a proposal means. Managed deployment is a first-class implementation of this option.
Evaluate SurrealDB as a bounded challenger if native graph syntax and
integrated change delivery materially reduce implementation. Evaluate AGE
only if the representative SQL workload proves awkward or slow enough to
justify an extension and its hosting constraints.

The required graph is authored architecture, rather than extracted code facts:
canonical subjects retain immutable IDs, semantic kinds, responsibility and
bindings. Structural containment has at most one parent and no cycles.
Dependencies can cycle. Flows retain ordered steps, decisions and loops rather
than being reconstructed from dependency arrows. Readings reference a state
and subjects. They do not duplicate definitions. These requirements come from
the [agreed discovery direction](../architecture-discovery-and-interaction.md).

Assessment: every option here can represent these structures. None establishes
Archboard's reconciliation rules merely by storing edges or historical values.
The distinguishing costs are query ergonomics, invariant enforcement, revision
resolution, tenant isolation and hosted operation.

| Option           | Useful native capability                                                       | Archboard still owns                                                     | Disposition                       |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------- |
| PostgreSQL       | Recursive SQL, constraints, transactions, RLS                                  | Revision DAG, effective-state resolution, semantic merge                 | Control and shortlist             |
| PostgreSQL + AGE | Property graph and openCypher alongside SQL                                    | Same revision/merge layer and graph-specific invariants                  | Conditional experiment            |
| Neon / Supabase  | Managed PostgreSQL plus service features                                       | Domain proposals/history and provider-specific authorization integration | Hosted implementations of control |
| SurrealDB        | Graph/document records, recursive paths, live queries, optional temporal reads | Proposal DAG, conflict policy, immutable domain history                  | Bounded challenger                |

## PostgreSQL: graph without a graph extension

PostgreSQL recursive common table expressions traverse hierarchies and graphs.
`SEARCH` calculates breadth/depth ordering and `CYCLE` detects revisited keys.
These query mechanisms do not require acyclic dependencies. Explicit cycle handling and bounded expansion are necessary for
cyclic architectural dependencies. Immediate-child queries and aggregation
from hidden descendants can use the same canonical tables. No performance
result is established here. [Recursive queries](https://www.postgresql.org/docs/18/queries-with.html).

A proposed control schema separates subject identity from state. The `subject`
table holds `(tenant_id, subject_id)`. Revision records hold semantic definitions.
Containment, relationship and flow records reference identities within a
resolved architectural state. A single nullable parent per subject-state
expresses structural membership. Relationships use separate edge records.
Flow steps need parent/ordering information and typed control nodes. JSONB can
hold discriminated payloads while relational columns retain keys and access
paths. This is a proposed model, not a claim that the database understands
Archboard semantics.

Primary/unique keys, foreign keys and not-null constraints can protect endpoint
existence, uniqueness and tenant-scoped references. PostgreSQL explicitly does
not support cross-row `CHECK` guarantees. A containment-cycle rule therefore
needs a checked write procedure/trigger with a concurrency strategy, rather
than a `CHECK` that queries ancestors. Unique parent ownership alone does not
prevent a cycle. [Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

An accepted semantic edit can commit subject changes, descendant reconciliation,
revision metadata and a change-log entry in one transaction. The default
isolation is Read Committed, which does not give a consistent snapshot across
multiple statements. Use a pinned immutable revision for reads. Evaluate Serializable transactions
or a locked revision-head record for write invariants, including retries. Serializable prevents serialization anomalies
but applications must handle serialization failures. This replaces a global
board claim with an explicit transaction boundary. Claims can remain visible
coordination rather than the correctness mechanism. [Isolation](https://www.postgresql.org/docs/18/transaction-iso.html).

Tenant isolation is a concrete strength, provided it is configured. RLS is
default-deny once enabled without a policy. Owners normally bypass it, and
superusers/`BYPASSRLS` always do. The proposed design uses tenant keys throughout
relationships and revisions, restrictive application roles, and tests that
traversal cannot cross tenants. RLS does not automatically make privileged
background agents tenant-scoped. [Row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

For change delivery, `NOTIFY` sends commit-delayed hints to current listeners.
Notifications are visible to all database users and payloads are small. A
server must publish only identifiers and perform authorized rereads. A durable
change table supports recovery after reconnecting. Logical replication offers a
continuous change stream with transactional ordering within a subscription,
but adds replication-slot and consumer operation. Neither mechanism is itself
a browser authorization layer. [NOTIFY](https://www.postgresql.org/docs/18/sql-notify.html),
[logical replication](https://www.postgresql.org/docs/18/logical-replication.html).

PostgreSQL uses its permissive PostgreSQL License. Self-hosting adds database
upgrades, recovery, monitoring and failover operation. A managed service avoids
much of that work. JavaScript integration does not require a new protocol:
Postgres.js documents Bun support, TypeScript types, transactions and
subscriptions. Actual repository compatibility still needs a small integration
exercise. [License](https://www.postgresql.org/about/licence/),
[Postgres.js](https://github.com/porsager/postgres).

## Revision and proposal work remains explicit

The following is a proposed application-owned version model for the control,
also relevant to AGE and SurrealDB. Each committed state gets an immutable
revision, parent revision(s), author/reason, source-repository revision and a
stable change identity. A proposal head points to a revision descended from a
known base. Acceptance creates another revision. A rename changes attributes,
never subject identity. Historical explanations and shared readings pin a
revision and evidence, not a wall-clock query alone.

The simplest credible first implementation stores full materialized states or
revision-to-record mappings. This costs storage and write amplification but
makes a pinned traversal straightforward. An overlay stores only changed and
deleted records against an ancestor. It saves copying but adds ancestry
resolution, tombstones, inherited-edge visibility, indexes over effective
state, cache invalidation and compaction. Traversing raw overlay edges is
incorrect when a nearer revision deleted or replaced an endpoint. Benchmark
that cost rather than assuming sparse writes mean cheap reads.

Three-way reconciliation compares base, current target and proposal by stable
subject/relationship/flow identity. It must distinguish independent property
changes from conflicting responsibility edits, reparenting, endpoint deletion
and ordering changes. A row-level conflict-free merge can still introduce a
containment cycle or a flow referencing a removed subject. Validate the
resolved whole and land the reconciliation atomically. Temporal validity
records, audit logs and backups answer different questions. None substitutes
for this domain decision.

## Apache AGE: graph syntax inside PostgreSQL

AGE is an Apache-2.0 PostgreSQL extension exposing property graphs and
openCypher, with graph and relational operations in the same database. Its
documentation describes directed edges with properties, variable-length
matching, and SQL invocation of Cypher. This is a real reduction in query
notation if Archboard needs repeated multi-hop pattern matching, rather than
proof of faster scope expansion. [Project and license](https://github.com/apache/age),
[graphs](https://age.apache.org/age-manual/master/intro/graphs.html),
[MATCH](https://age.apache.org/age-manual/master/clauses/match.html).

The hosting and schema costs are significant. AGE returns its own `agtype`
rather than ordinary JSONB, and connections require extension loading and
search-path initialization. The release page lists PostgreSQL-specific
packages: AGE 1.7.0 for PG18 and 1.6.0 for PG14–17. Its FAQ still says support
through PG16. Pin the exact PostgreSQL/AGE pair instead of treating all current
documentation as one compatibility promise. A Node.js driver is listed, but
its Bun/type conversion behavior was not verified. [Types](https://age.apache.org/age-manual/master/intro/types.html),
[installation](https://github.com/apache/age#installation),
[releases](https://age.apache.org/download/), [FAQ](https://age.apache.org/faq/).

AGE supplies no demonstrated domain branch/merge primitive here. Immutable
revisions or overlays still need a model, and stable architectural IDs must
remain explicit properties/keys rather than engine-assigned graph IDs.
Make sure that the chosen SQL/graph model enforces foreign keys and uniqueness
during concurrent reparenting. Make sure that RLS governs every Cypher read and
write path. This research did not establish an AGE RLS security contract.
Inheriting PostgreSQL storage is insufficient evidence.

Neon's published supported-extension table does not list AGE. Supabase's
extension documentation offers preinstalled extensions and installation of
pure SQL extensions. That does not authorize installing AGE's compiled server
code. AGE availability on hosted Supabase was not verified. EDB documents AGE
packages, but package support does not establish a managed HA offering for the
desired configuration. Require provider confirmation before an AGE hosted
prototype. [Neon extensions](https://neon.com/docs/extensions/pg-extensions),
[Supabase extensions](https://supabase.com/docs/guides/database/extensions),
[EDB installation](https://www.enterprisedb.com/docs/pg_extensions/apache_age/installing/).

## Managed PostgreSQL: Neon and Supabase

Neon's database branches are isolated copy-on-write database environments with
their own endpoints. They can start from historical state. They are useful for
tests and previews. Their boundary is a database, rather than an Archboard proposal. Neon explicitly
says it does not directly merge diverged branches like Git. Applying schema migrations or data scripts back is caller-owned.
Do not allocate a database branch per domain proposal unless that operational
boundary proves useful independently. [Branching](https://neon.com/docs/introduction/branching),
[promotion workflow](https://neon.com/blog/promoting-postgres-changes-safely-production).

Neon documents multi-AZ storage and compute restart/rescheduling, with brief
disconnections and vendor-claimed recovery of seconds to minutes. Backup,
instant restore and configurable history windows are operational recovery,
not permanent authored history. Its RLS guide explicitly supports PostgreSQL
policies and requires them for Data API tables. These are verified features,
not conclusions from the phrase “PostgreSQL compatible.” [HA](https://neon.com/docs/introduction/high-availability),
[backup/restore](https://neon.com/docs/guides/backup-restore),
[RLS](https://neon.com/docs/guides/row-level-security).

Neon Realtime launched public beta on 2026-10-15. The announcement explicitly
says no RLS yet, despite ordinary Neon PostgreSQL supporting RLS. It offers
backend-sealed queries. Tenant-scoped sealed-query authorization needs separate
evaluation. Claims of arbitrary deterministic live SQL and scaling are vendor
claims without published benchmarks. Its TypeScript serverless driver supports
HTTP noninteractive transactions and WebSocket interactive transactions. Normal
Postgres clients remain an alternative. [Realtime announcement](https://neon.com/blog/neon-now-has-realtime),
[driver](https://neon.com/docs/serverless/serverless-driver).

Supabase combines PostgreSQL, Auth, RLS and JavaScript APIs. Its docs explicitly
warn that `service_role` bypasses RLS. Postgres Changes can authorize subscriber
events, but checks each subscriber and processes changes on one thread.
Relationship-derived readings still need invalidation/rereading. Pro and above
have daily backups. PITR is additional configuration. Its newer Multigres HA
offering is Private Alpha, excluded from SLA and not targeted at production
or mission-critical workloads. Obtain a concrete production recovery/failover
contract rather than treating backups or read replicas as equivalent.
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[changes](https://supabase.com/docs/guides/realtime/postgres-changes),
[backups](https://supabase.com/docs/guides/platform/backups),
[Multigres](https://supabase.com/docs/guides/database/multigres).

Pricing is service-specific, separate from PostgreSQL's license. At consultation,
Neon Launch lists $0.106/CU-hour and $0.35/GB-month, with other branch/history
and network charges. Supabase Pro starts at $25/month with compute credits,
included storage/egress and metered additions. These are comparison inputs,
not a total-cost estimate. Budget revision growth, retained evidence,
always-on subscriptions, PITR and egress using the same measured workload.
[Neon pricing](https://neon.com/pricing), [Supabase pricing](https://supabase.com/pricing).

## SurrealDB: integrated graph, documents and temporal reads

SurrealDB's current stable release is 3.3.4, released 2026-10-13. Native relation
tables carry edge metadata. Recursive paths support multi-hop queries without
client traversal loops. Record links offer another representation. Assessment:
this can simplify heterogeneous flow payloads and graph reads. Choose one
canonical representation per relationship rather than maintaining links and
graph copies. [Releases](https://surrealdb.com/releases),
[RELATE](https://surrealdb.com/docs/reference/query-language/statements/relate),
[recursive traversal](https://surrealdb.com/docs/learn/data-models/graph/recursive-traversals).

Transactions use snapshot isolation with optimistic write-conflict detection,
not serializable isolation. Since 3.3, `FOR UPDATE` adds named records to
commit-time conflict checks. It does not lock predicates/ranges. Proposed
control: write or check a shared architecture-head record when enforcing
cross-record invariants. Schema assertions and indexes help, but parent
acyclicity, immutable identities and coherent revision publication still need
application rules. [Transaction contract](https://surrealdb.com/docs/learn/querying/concepts-and-guides/transactions).

Namespaces/databases provide tenant boundaries. Table/field `PERMISSIONS`
provide record-level rules for record users. System users bypass those rules.
A tenant namespace is therefore useful only with correctly scoped credentials.
The JavaScript/TypeScript SDK documents remote/embedded connections and live
queries, with SDK 2.1.1 supporting the current server. SurrealQL is a new query
language and its record/value types require integration work.
[Tenancy](https://surrealdb.com/docs/learn/schema-management/multi-tenancy/namespace-and-database-architecture),
[permissions](https://surrealdb.com/docs/learn/security/authorization/permissions-and-row-level-security),
[SDK](https://surrealdb.com/docs/reference/javascript).

`VERSION` provides timestamped historical reads when the storage engine has
versioning enabled. Current docs describe RocksDB and beta SurrealKV support.
The roadmap still labels versioned temporal tables experimental. Retention
is configurable, and memory storage rejects versioned queries. This is not a
proposal commit DAG or a semantic three-way merge. Cloud's precise versioning
availability/retention on each topology remains unverified: the deployment
matrix says “where enabled.” Preserve immutable domain revisions even if
temporal reads help diagnosis. [SELECT VERSION](https://surrealdb.com/docs/reference/query-language/statements/select),
[roadmap](https://surrealdb.com/roadmap),
[storage configuration](https://surrealdb.com/docs/reference/cli/db/commands/start).

`LIVE SELECT` sends committed changes but does not guarantee total commit
ordering across writers. Community subscriptions see writes on their own node.
Distributed live queries are Enterprise. Node subscriptions do not automatically
react when only an edge changes. Retained changefeeds offer replay after
disconnects, with explicit retention and cursor processing. Assessment: use
revision publication as the event boundary, rather than interpreting many
record events as one coherent architecture update.
[Live query contract](https://surrealdb.com/docs/reference/query-language/statements/live-select),
[changefeeds](https://surrealdb.com/docs/learn/querying/real-time/changefeeds).

Hosted operation is real: Start is single-node. Scale is a managed cluster
of three or more nodes. Backups run daily by default and restore to a new
instance. Portable exports are separate. Pricing lists Scale from $0.192 per
node-hour, three-node minimum, while Cloud branching/forking is marked coming
soon. The core uses BSL 1.1. The vendor FAQ reserves third-party database
services for commercial licensing. Archboard's authored-architecture service
appears different from exposing database schema administration, but confirm
the pinned license terms before selection. [Deployment](https://surrealdb.com/docs/manage/self-hosted/deployment-models),
[backups](https://surrealdb.com/docs/manage/instances/backups),
[pricing](https://surrealdb.com/pricing), [license](https://surrealdb.com/license).

## Bounded decision experiment

Use the PostgreSQL control and one SurrealDB hosted instance with identical
authored data. Include 10,000 subjects, containment depth 12, and 50,000 cyclic
dependencies. Include ordered decision/loop flows, 100 revisions and 20 sparse
proposals. These are
proposed test sizes, not known production requirements. Measure immediate
scope opening, hidden-descendant edge aggregation, caller context, pinned
historical flows, three-way comparison and concurrent reparent/delete/merge.
Include two tenants, malicious cross-tenant endpoints, expired credentials,
disconnect/replay and backup restoration.

Compare p50/p95 database latency, round trips, bytes, storage growth, query
complexity and invariant code. Test full revision materialization before
introducing overlays. Add AGE only if it can remove demonstrated query
complexity within an available hosted configuration. No additional emerging
engine earned a separate candidate here. Another protocol or distributed layer
expands the evaluation without resolving its central uncertainty if it retains
the revision/merge work.
