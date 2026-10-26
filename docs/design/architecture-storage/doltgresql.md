# DoltgreSQL for canonical architecture storage

Research for TASK-543. Sources consulted on 2026-10-25. This report evaluates
[the agreed product direction](../architecture-discovery-and-interaction.md).
It records a candidate, not a storage decision. No database was installed or
run. Source inspection uses release `v1.4.0` unless stated otherwise.

A separate [functional experiment](doltgresql-smoke.md) records a small local
run of the same release. Its observations do not establish production capacity
or tenant isolation.

## Recommendation and maturity

Keep DoltgreSQL on the shortlist for a bounded proof of concept. Native data
branches, comparisons, and merges fit proposals over shared architectural
subjects. They can remove substantial application code for storing and comparing
proposal states. Adoption depends on tenant isolation, concurrent writes, and
recovery tests. PostgreSQL compatibility does not establish those properties.

Use hosted PostgreSQL as the baseline for the first hosted implementation.
PostgreSQL already provides RLS and selectable transaction isolation. Doltgres
becomes preferable if native proposals remove enough application complexity to
justify its compatibility gaps and operational constraints. PostgreSQL requires
application-owned proposal snapshots, comparisons, and reconciliation. Its
transaction snapshots do not replace that product behavior.
[PostgreSQL row policies](https://www.postgresql.org/docs/15/ddl-rowsecurity.html),
[PostgreSQL isolation](https://www.postgresql.org/docs/15/transaction-iso.html)

DoltgreSQL, also called Doltgres, is an independent database implemented over
Dolt's engine. It emulates PostgreSQL rather than extending a PostgreSQL server.
Dolt uses MySQL's protocol and dialect. Doltgres uses PostgreSQL's protocol and
dialect, with version control exposed through SQL. It has no equivalent of
Dolt's version-control command-line interface. Shared internals explain its
design, but do not prove that each Dolt feature works through Doltgres.
[Doltgres introduction](https://www.doltgres.com/docs/introduction/)

The project launched 1.0 on August 6, 2026. The vendor commits to readable 1.x
storage and stable 1.x version-control interfaces. The latest release returned
by GitHub's API during this investigation was 1.4.0, published October 1, 2026.
These are recent production commitments, not a long operational record.
[1.0 announcement](https://www.dolthub.com/blog/2026-08-06-doltgres-1-0/),
[1.4.0 release](https://github.com/dolthub/doltgresql/releases/tag/v1.4.0),
[release API](https://api.github.com/repos/dolthub/doltgresql/releases/latest)

Prefer current Doltgres documentation over older Dolt pages and launch articles.
For example, the older product overview still calls it pre-alpha. The October
roadmap records 1.0 and lists remaining features. Roadmap dates are estimates,
not shipped capabilities.
[Old overview](https://www.dolthub.com/docs/products/doltgres/),
[October roadmap](https://www.doltgres.com/docs/other/roadmap/)

## Preserving the semantic model

The following mapping is an application design proposal. Store subjects in one
table with stable IDs, responsibilities, kinds, and an optional parent ID.
Store relationships separately with source and target IDs. Store flows and
their ordered steps separately. A reading selects these definitions at an
architectural revision. It does not own another copy.

A nullable parent reference expresses at most one structural parent. Dependencies
can form cycles without changing containment. Insert subjects before their
relationship rows. Flow order, decisions, loops, and asynchronous behavior remain
authored facts. SQL joins cannot infer execution order from dependency edges.

Use the existing subject ID rules. A primary key provides uniqueness, but does
not make an ID immutable. Archboard must reject ID changes and preserve IDs
through imports, renames, and proposals. Repository identity, source commit,
path, and evidence belong in explicit records. A database commit identifies
architectural state. It does not identify a source Git commit automatically.

Version evidence associations with the subjects they describe. Keep operational
facts such as sessions and editing claims outside proposal history. Otherwise,
merging architectural changes also merges stale operational state. The proposed
database boundary is one architecture workspace containing all subjects that
must change together. Splitting it by today's boards recreates shared-ownership
problems.

Recursive queries are credible here. Release tests cover recursive common table
expressions, including cyclic graphs, path arrays, self-loops, and PostgreSQL's
`CYCLE` clause. These are stronger evidence than a general compatibility claim.
They do not establish performance for Archboard's ancestor searches or
relationships aggregated across hidden descendants.
[Recursive query tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/with_recursive_cycle_test.go)

## PostgreSQL compatibility that matters

The documentation targets PostgreSQL 15 behavior and describes deviations.
Treat it as a compatibility surface that requires a query corpus, not permission
to use the whole PostgreSQL ecosystem without testing.
[SQL support policy](https://www.doltgres.com/docs/reference/sql-support/)

| Area                 | Evidence and consequence                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constraints          | Release tests exercise primary keys, unique constraints, foreign keys, and `CHECK`, including preservation through merges. These support canonical references. They do not enforce an acyclic parent hierarchy. |
| Deferred constraints | The translator explicitly rejects `DEFERRABLE` constraints. Plan insert order and relationship updates accordingly.                                                                                             |
| Indexes              | Regular, partial, and expression indexes have release tests. Test plans as well as results. GIN indexes remain on the roadmap.                                                                                  |
| JSON                 | `json` and `jsonb` are documented types. Use relational columns for identity, containment, and relationship endpoints. JSON can retain flexible metadata.                                                       |
| Transactions         | `BEGIN`, `COMMIT`, rollback, and savepoints are documented. Isolation-level selection and `SELECT FOR UPDATE` are unsupported.                                                                                  |
| Prepared queries     | Protocol-level prepared statements work. SQL `PREPARE` and `EXECUTE` are unsupported.                                                                                                                           |

Sources: [merge and constraint tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/merge_test.go),
[constraint translation](https://github.com/dolthub/doltgresql/blob/v1.4.0/server/ast/constraint_table_def.go),
[partial index tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/partial_index_join_test.go),
[expression index tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/functional_index_multi_expr_test.go),
[index roadmap](https://www.doltgres.com/docs/other/roadmap/),
[types](https://www.doltgres.com/docs/reference/sql-support/supported-types/),
[command limitations](https://www.doltgres.com/docs/reference/sql-support/supported-commands/).

The vendor tests `node-postgres`, Knex, Drizzle, pgx, JDBC, and other clients.
Its documentation describes these as connection and query integration tests.
That establishes a practical starting point for TypeScript. It does not prove
that every ORM migration, introspection query, or connection pool configuration
works. Bun's native SQL client is not established by this evidence.
[Supported clients](https://www.doltgres.com/docs/reference/supported-clients/clients/)

Extensions require separate decisions. In September, the project replaced its
native extension-loading approach with implementations of selected extension
interfaces. The announcement names `uuid-ossp` and `pgvector` as implemented.
Arbitrary PostgreSQL extensions cannot be assumed to work. RLS, PostGIS, and
`pgcrypto` remain roadmap items in the October document.
[Extension design](https://www.dolthub.com/blog/2026-09-03-doltgres-extensions-update/),
[roadmap](https://www.doltgres.com/docs/other/roadmap/)

## Branches, working state, and concurrent agents

A data branch is an independently writable database state with shared ancestry.
An environment clone is another deployed copy of a database. Transaction
isolation gives each transaction a consistent view. These are three different
mechanisms. Only native data branches provide the proposed mergeable proposal
states.

Connections can select `database/branch`. A commit hash or tag selects a
read-only state. Multiple sessions can use one branch. Its working set contains
changes not yet recorded in a Dolt commit. SQL commits make writes visible to
other sessions on that branch under repeatable-read isolation. They do not make
a Dolt commit by default. Separate branches isolate proposed data changes.
[Branches](https://www.doltgres.com/docs/reference/version-control/branches/),
[history](https://www.doltgres.com/docs/reference/version-control/querying-history/)

Pin the database and branch when acquiring a connection. `DOLT_CHECKOUT` changes
session state, so returning that connection to a general pool can misdirect
later requests. A transaction cannot commit writes to multiple branches.
Branch creation and `DOLT_COMMIT` also have implicit transaction boundaries.
Archboard must design its operation boundary around them.
[Branch behavior](https://www.doltgres.com/docs/reference/version-control/branches/),
[function contracts](https://www.doltgres.com/docs/reference/version-control/dolt-sql-functions/)

One agent per proposal branch is a useful starting policy. Separate sessions
on one branch still publish to one shared branch state. A connection is not a
private proposal. Test whether a commit includes another
session's earlier writes. Preserve explicit claims and expected-revision checks
where the product needs ownership or stale-write refusal.

The vendor states that Doltgres serializes writes. It gives approximately 300
writes per second as workload-dependent guidance. Treat this as a vendor
estimate, not an Archboard capacity result. Source inspection finds an active
concurrent-transaction test, but several inherited transaction suites are
skipped. Their presence does not establish full Dolt test coverage.
[Doltgres operational guidance](https://www.doltgres.com/docs/reference/server/troubleshooting/),
[engine test entry points](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/enginetest/doltgres_engine_test.go)

## Proposals, comparisons, and merge limits

A proposal can retain a base commit and a branch. Historical readings can pin
the commit instead of following a moving branch. Native system tables expose
commits, ancestry, row history, blame, and comparisons. `DOLT_DIFF` supports
comparisons across schema changes. Archboard still owns proposal names, reasons,
review status, permissions, and explanations of changed architectural meaning.
[History tables and comparisons](https://www.doltgres.com/docs/reference/version-control/dolt-system-tables/)

The merge interface exposes data conflicts, schema conflicts, and constraint
violations. SQL can inspect and resolve them. A successful merge normally creates
a commit and completes its transaction. Application validation must therefore
have a proved place before publication. Do not assume that wrapping the function
in `BEGIN` preserves an uncommitted successful result for later validation.
Schema conflict resolution with `--ours` or `--theirs` takes the entire table,
including data.
[Merge contracts](https://www.doltgres.com/docs/reference/version-control/merges/)

JSON merging is actually tested in Doltgres. Release tests merge independent
object-key edits in both JSON and JSONB. This does not establish every nested
array or ordered-flow case. Structural merging cannot judge whether two valid
changes contradict an architectural explanation. For example, separate parent
edits can create a containment cycle. Flow edits can preserve foreign keys while
changing the intended order. Run domain validation on the combined state.
[JSON merge tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/merge_test.go)

## Tenant isolation and hosted operation

Do not use branches as tenant boundaries. Branch permissions control writes and
branch creation. Their documentation explicitly says that branch read access
cannot be revoked. Use branches only within an already authorized workspace.
[Branch permissions](https://www.doltgres.com/docs/reference/server/branch-permissions/)

RLS means database policies that restrict individual rows. It is absent in the
examined release. Worse, the translator accepts the `ALTER TABLE` RLS form but
ignores it. A successful statement does not establish protection. Table, schema,
and database grants exist, with documented gaps. Separate databases and narrowly
scoped credentials require negative access tests across current data, historical
queries, comparisons, and version-control functions. Dedicated deployments give
a stronger boundary at additional operating cost.
[Ignored RLS command](https://github.com/dolthub/doltgresql/blob/v1.4.0/server/ast/alter_table.go),
[unsupported policy catalog](https://github.com/dolthub/doltgresql/blob/v1.4.0/server/tables/pgcatalog/pg_policy.go),
[access management](https://www.doltgres.com/docs/reference/server/access-management/)

Hosted Dolt offers running Doltgres servers, monitoring, backups, and upgrades.
Its current API distinguishes `doltgres` deployments and engine versions. This
is different from DoltHub, the remote collaboration service. DoltHub added
Doltgres browsing, queries, comparisons, and pull requests on October 19, 2026.
Those features are recent. Neither service removes Archboard's authorization
responsibility.
[Hosted launch](https://www.dolthub.com/blog/2025-02-07-hosted-doltgres/),
[Hosted API models](https://www.dolthub.com/docs/products/hosted/api/v1/models/),
[DoltHub launch](https://www.dolthub.com/blog/2026-10-19-doltgres-on-dolthub/)

Hosted documentation advertises a $50 monthly trial instance with 50 GB storage.
The API returns deployment costs and available instance/storage choices. Its
examples are not a binding Doltgres production quote. Exact regional prices,
replica costs, private networking, recovery objectives, and availability
commitments remain procurement questions. Do not transfer Dolt-specific hosting
features automatically to Doltgres.
[Published trial](https://www.dolthub.com/docs/products/hosted/notable-features/),
[deployment API](https://www.dolthub.com/docs/products/hosted/api/v1/deployment/)

The engine uses Apache-2.0. Its license grants commercial use and distribution
without a database-as-a-service exclusion. License and notice obligations still
apply. Hosted service terms and the licenses of bundled dependencies need
separate evaluation. Archboard can self-host the engine rather than depend on
a vendor hosting API.
[Release license](https://github.com/dolthub/doltgresql/blob/v1.4.0/LICENSE)

## Recovery, availability, and measured evidence

Doltgres documents remote replication of Dolt commits and direct replication of
all SQL commits to standby servers. Remote replicas cannot fail over automatically.
Direct replication supports role changes, but lost-primary promotion is not
guaranteed lossless. Users, grants, and database deletions are not replicated.
There is no documented transactional multi-primary solution. These are Doltgres
documents, not assumptions from Dolt support.
[Replication](https://www.doltgres.com/docs/reference/server/replication/)

For backups, the vendor recommends consistent block-device snapshots. Live file
copies are unsafe. Include authorization and branch-control files alongside the
data. Release tests cover backup and restoration of data and history. Database
history cannot replace backups against lost storage or corruption.
[Backup guidance](https://www.doltgres.com/docs/reference/server/backups/),
[backup tests](https://github.com/dolthub/doltgresql/blob/v1.4.0/testing/go/dolt_backup_test.go)

A September postmortem records unrecoverable TEXT/JSON losses for data written
by old beta versions. Backup and garbage collection shared the defective
reference traversal. Version 1.3.0 added repairs and startup detection. This is
evidence for independent restore tests, not evidence that new 1.4.0 data has the
same defect. The proposed separate block-snapshot backstop was still in progress
when that article appeared. Its completion remains unconfirmed here.
[Incident and repair](https://www.dolthub.com/blog/2026-09-04-postgres-data-loss-post-mortem/)

The vendor's 1.0 benchmarks report about 2.7 times PostgreSQL's mean query
latency and 99.317097% on its SQL correctness suite. These measure specific
tests, not total PostgreSQL feature coverage or Archboard performance. Retained
history and random IDs also require disk-growth measurements.
[Latency](https://www.doltgres.com/docs/reference/benchmarks/latency/),
[correctness](https://www.doltgres.com/docs/reference/benchmarks/correctness/),
[storage guidance](https://www.doltgres.com/docs/reference/server/troubleshooting/)

## Proof-of-concept acceptance cases

Use 100,000 subjects, 500,000 relationships, 1,000 flows, and 100 proposal
branches. Include deep containment, dependency cycles, shared subjects, large
TEXT/JSON values, and multiple source repositories. These sizes are proposed
evaluation inputs. Compare PostgreSQL on identical hardware with identical data.

1. Canonical meaning: Read Authentication from two scopes, rename it, and reopen
   both at the same commit. Pass if both return one unchanged ID and definition.
2. Graph behavior: Query immediate parts, ancestors, bounded cyclic dependencies,
   and aggregated outside relationships. Pass if results match a reference model
   and representative scope queries meet a provisional 100 ms database p95.
3. Atomic writes: Change a subject, relationships, flow, and evidence together.
   Inject an error before commit. Pass if readers see the entire change or none.
4. Concurrent agents: Run eight writers on separate proposals and on one branch.
   Pass if there are no silent overwrites, mixed proposal writes, or misattributed
   commits. Record retries, conflicts, and p95 latency.
5. Merge meaning: Exercise separate fields, conflicting fields, deletion against
   new references, JSON keys, flow order, and a newly formed containment cycle.
   Pass if valid combinations survive and invalid combined meaning never reaches
   the published branch. Prove the validation and publication transaction order.
6. Tenant denial: Attempt cross-tenant reads through normal queries, commit URLs,
   history, comparisons, remotes, and merge functions. Pass only if every route
   refuses access with production credentials. RLS DDL success does not count.
7. Recovery: Restore independent backups after forced termination and garbage
   collection. Pass if all branches, history, large values, and access controls
   match. Measure data loss and recovery time during standby promotion.
8. Operating cost: Repeat proposal creation, merge, deletion, and garbage
   collection. Pass if measured storage growth, latency, and a quoted hosted
   configuration fit an agreed budget. No budget or capacity result is established
   by this report.
