# Versioned graph and temporal storage

Research for TASK-543, consulted 2026-10-25. This evaluates the intended
[architecture discovery model](../architecture-discovery-and-interaction.md),
not the current board-file boundary. Sources below are first-party documentation,
release records, and source licenses. No services were installed or benchmarked.

## Finding

TerminusDB deserves a bounded evaluation for the canonical architecture and
proposal store. It combines typed graph documents with durable branches,
structured differences, and merge operations. Hosting availability and actual
merge semantics need verification before selection. XTDB v2 is a credible
historical-query engine, but presently a weaker primary fit. Durable proposal
branches require application work, and its SQL lacks recursive queries. Fluree now
merits a small competing evaluation because current first-party material shows
real graph branching. Its license and fast-changing release surface need care.
Datomic supplies strong historical graph foundations, but does not eliminate
proposal infrastructure.

A Merkle structure links content through hashes of that content.
These are four different capabilities:

| Capability                                  | What it answers                                              | What it does not establish                         |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Immutable, content-addressed/Merkle storage | Which exact content and ancestry does this object reference? | Subject identity, authorization, or a merge policy |
| Transaction-time history                    | What did the database know at a recorded state?              | Independent alternative futures                    |
| Bitemporal querying                         | What was effective at time V, as known at time S?            | Durable proposal branches                          |
| Speculative transactions                    | What can this query return after hypothetical edits?         | A shared, persistent branch with diff and merge    |

Archboard's architectural subject ID must remain separate from every storage
hash, commit ID, source path, and internal database identifier. A renamed module
is the same subject in another state. Ordered flows, conditions, and loops must
remain authored facts. No graph query can infer their intended execution order
from dependency edges alone. Those are product requirements, not database features.

## TerminusDB

### Current state and hosting

This is not an abandoned-product conclusion based on old TerminusCMS pages.
The official repository identifies Gettier as maintainer, and the current
release is 12.0.8, published 2026-10-12. The core is Apache-2.0 and has an
official JavaScript client for Node and browsers.
([Repository](https://github.com/terminusdb/terminusdb),
[release](https://github.com/terminusdb/terminusdb/releases/tag/v12.0.8))

The current hosting page explicitly calls managed TerminusDB Cloud early
access, offered through Gettier on Azure, AWS, or Google Cloud. Azure Marketplace
is described as coming in autumn 2026, with a VM in the customer's subscription.
That establishes an offer and a contact route, not general availability, a
public price, service-level commitments, or a tested signup. Treat self-hosting
as the independently available deployment. Cost therefore means compute,
persistent disk, operations, and optional quoted Enterprise/managed support.
No defensible hosted monthly estimate emerged.
([Hosting options](https://terminusdb.com/docs/cloud/),
[Azure offer](https://terminusdb.com/docs/deploy-on-azure/))

### Model, history, and proposals

JSON schema classes and typed references can represent canonical modules and
typed relationship documents. Optional values can represent a single structural
parent. Sets and lists can represent collections and ordered flow steps.
For evaluation, use a stable `subjectId` as the lexical key,
never a mutable module name or a value hash. General relationships can cycle.
Containment must separately prohibit cycles. References preserve canonical
definitions across readings. Automatic unfolding detects cycles and returns
an ID reference at a repeated ancestor. Focused projections can
select just the requested scope.
([Schema](https://terminusdb.org/docs/schema-reference-guide/),
[cycle handling](https://terminusdb.org/docs/document-unfolding-reference/))

WOQL provides Datalog-style pattern matching and paths. GraphQL offers a
schema-derived query surface. This is a native graph candidate rather than a
JSON blob store with a graph assembled later. Documents decompose into immutable,
content-addressed delta layers, with rollup to flatten accumulated layers. That
supports storage sharing and historical states. The application ID still names
the architectural subject independently of content.
([System overview](https://terminusdb.com/docs/at-a-glance/),
[immutability](https://docs.terminusdb.org/docs/immutability-explanation/))

Commit history is not automatically bitemporal history. TerminusDB's date and
interval reasoning can query authored effective-time fields. Archboard must
define those fields and their correction semantics. Do not count that
as XTDB-style system-maintained valid-time versioning.
([Temporal query examples](https://docs.terminusdb.org/docs/time-tutorial-dates/))

API paths explicitly address durable branches. Historical commits are
queryable without switching a global checkout. The API exposes structured diff,
apply, rebase, reset, and squash. This closely matches proposals stored as branches.
An evaluation can retain the proposal's base commit, author, status, rationale,
and evidence revision. It can query either main or its branch through the same
reading projection.
([Operations](https://terminusdb.com/docs/version-control-operations/))

Do not equate the marketing phrase “Git-like merge” with architectural correctness.
The merge guide describes field conflicts, while the knowledge-graph explanation
also describes commit replay and triple-level conflicts. Pin the exact operation
and three-way base in a spike. The guide's simple examples do not demonstrate
both branches advancing from a common ancestor. Even a structurally clean merge
can introduce a containment cycle, delete a flow's participant, or combine
incompatible relationship meanings. Before publication, make sure that the complete resulting semantic
state satisfies the product rules in one atomic transaction.
([Merge guide](https://docs.terminusdb.org/docs/merge-howto/),
[version-control explanation](https://docs.terminusdb.org/docs/knowledge-graph-version-control/))

### Concurrent agents, tenants, and recovery

Reads use immutable snapshots. Writes detect whether the branch head moved and
retry optimistically. Independent branches avoid competing on the same head.
The JavaScript API exposes `lastDataVersion` and version-return options. Archboard
still needs stale-intent rejection: retrying a database transaction is different
from proving that an agent's replacement document was based on the current
subject. Test that contract explicitly.
([Concurrency](https://docs.terminusdb.org/docs/immutability-and-concurrency/),
[client API](https://terminusdb.org/docs/javascript/))

Capabilities apply to organizations or databases, with organization permissions
inherited additively. A database per tenant/project is therefore the sensible
first boundary to test. Branches are not documented security boundaries. Avoid
granting broad organization rights when projects must be isolated. Application
authorization must also cover reading IDs, history, diffs, and exports.
([Access control](https://docs.terminusdb.org/docs/access-control/))

Community CLI bundles include branches, commits, and data, restorable between
instances of the same version. A stopped-volume backup covers the entire
instance. Enterprise adds backup APIs, observability, and document formats.
An evaluation also needs a portable semantic JSON export. A binary backup
preserves the engine. An application export preserves the ability to leave it.
([Self-hosting and backups](https://terminusdb.com/docs/self-hosted-installation/),
[Enterprise boundary](https://terminusdb.com/docs/enterprise/))

## XTDB: do not combine v1 and v2 capabilities

JUXT maintains XTDB under MPL-2.0. v2.2.0 shipped 2026-10-21.
The v1 line has a separate code branch and documentation. Version 1.24.5 shipped
2025-03-25. An older landing page still calls v1 current and v2 early access.
Use release records and current v2 docs to identify the evaluated product.
The v1 release date alone does not prove either abandonment or a future support
commitment.
([Repository](https://github.com/xtdb/xtdb),
[v2 release](https://github.com/xtdb/xtdb/releases/tag/v2.2.0),
[v1 release](https://github.com/xtdb/xtdb/releases/tag/1.24.5),
[stale landing page](https://xtdb.com/docs))

### v1: document graph and hypothetical states

v1 offers document-oriented Datalog, recursive graph queries, transaction
functions, and bitemporal history. Its `with-tx`/`withTx` returns a speculative
database value whose changes are neither persisted nor submitted to the cluster.
That can validate a proposed state, but does not provide a durable branch that
another agent can reopen and merge. Its transaction log and document store are
the “golden stores.” Operators can rebuild indexes. Backup depends on the chosen
underlying stores. These v1 capabilities do not establish equivalent v2 capabilities.
([v1 transactions](https://v1-docs.xtdb.com/language-reference/1.24.3/datalog-transactions/),
[v1 configuration](https://v1-docs.xtdb.com/administration/configuring/),
[v1 FAQ](https://v1-docs.xtdb.com/resources/faq/))

### v2: strong temporal SQL, missing proposal machinery

v2 is a dynamic relational database built on Arrow and object storage, with
automatic system-time and valid-time history. Model subjects and relationships
as separate rows with stable application `_id` values, and flows as explicit
steps/transitions. Bitemporality is useful when evidence arrives late or an
explanation must reproduce what was believed at a given time. It is not a
substitute for independent proposal states.
([v2 model](https://docs.xtdb.com/intro/what-is-xtdb.html))

The current SQL reference explicitly says `WITH RECURSIVE` is unsupported.
This SQL feature lets queries follow relationships repeatedly.
Consequently arbitrary-depth containment and cyclic dependency traversal require
application traversal, precomputed reachability, or another query surface whose
capability must be demonstrated. This is a material fit penalty, not an assertion
that XTDB cannot store graphs. I found no documented v2 durable branch/diff/merge
workflow. Unless a concrete supported API is demonstrated, budget that as
Archboard-owned work.
([SQL reference](https://docs.xtdb.com/reference/main/sql/queries.html))

Writes are non-interactive, serialized transactions. DML means statements that change data.
DML and `ASSERT` can run
together. Returning `SELECT` queries cannot be mixed with DML. Assertions can
make sure that expected revisions, endpoint existence, and uniqueness hold atomically. There
is no upfront enforced schema. The write contract must enforce the semantic rules. The Node guide uses Postgres.js with explicit parameter
types and optional Transit handling. PostgreSQL wire compatibility is not full
PostgreSQL feature compatibility.
([Transactions](https://docs.xtdb.com/about/txs-in-xtdb.html),
[ASSERT and DML](https://docs.xtdb.com/reference/main/sql/txs.html),
[JavaScript integration](https://docs.xtdb.com/drivers/nodejs.html))

For reproducible readings, retain snapshot token plus clock time, rather
than only a wall-clock timestamp. Across connections, propagate an await token
when a reader must observe another connection's acknowledged write. These are
explicit responsibilities for Archboard's pooled server connections.
([Consistency and basis](https://docs.xtdb.com/about/txs-in-xtdb.html))

v2.1 added multiple databases. v2.2 elects a writer per database, with separate
source/replica logs and object storage. Transactions cannot cross databases,
although queries can. Separate storage resources or clusters can bound tenants,
but database attachment alone proves no access isolation. Current authorization
docs explain role membership and note that OIDC cannot yet manage memberships.
They do not establish PostgreSQL-equivalent table grants or row security.
Demonstrating tenant denial is a selection gate.
([Database boundaries](https://docs.xtdb.com/about/dbs-in-xtdb.html),
[authorization](https://docs.xtdb.com/ops/config/authorization.html))

The homepage advertises cloud marketplaces. Operational docs describe customer
infrastructure, not a verified managed SaaS price. Budget JVM nodes, log service,
object storage, caches, and operations. Backups must respect flush boundaries:
storage-only restoration can lose unflushed transactions.
To reduce potential data loss, preserve the log. Back up storage before log. Portable exports need
explicit historical ranges, not just a current-state SQL dump.
([Deployment](https://xtdb.com/),
[Azure requirements](https://docs.xtdb.com/ops/azure),
[recovery](https://docs.xtdb.com/ops/backup-and-restore/overview))

## Brief alternatives

Datomic remains active: Pro 1.0.7745 shipped 2026-10-16. Datoms are facts with transaction and assertion metadata.
Its immutable datoms,
references, Datalog, historical database values, and serialized ACID transactions
fit a canonical graph. However, its own docs explicitly distinguish `as-of`
plus speculative `with` from branching the past. Durable proposals, merges,
and domain conflict reporting remain application responsibilities.
([Release](https://docs.datomic.com/releases-pro.html),
[model and editions](https://docs.datomic.com/),
[branch limitation](https://docs.datomic.com/reference/filters.html))

Pro runs on customer infrastructure. Cloud is AWS-only, with infrastructure
charges and no license fee. Binaries carry Apache-2.0, but that does not mean
the engine source is open. Official APIs are JVM-oriented. This adds an integration
seam for a TypeScript server. Pro supplies incremental backup/restore. Keep it
as a reference for temporal graph semantics rather than the first proposal-store
spike.
([Licensing](https://blog.datomic.com/2023/04/datomic-is-free.html),
[cost](https://www.datomic.com/faq.html),
[backup](https://docs.datomic.com/operation/backup.html))

Fluree is a credible renewed candidate: stable Rust v4.2.4 shipped
2026-10-14, alongside a v5 alpha. Current docs describe RDF/SHACL, graph queries,
content-addressed commits, policies, and durable branches. Branch diff and merge
are concrete commands. The default merge strategy is `take-both`.
Accepting that strategy blindly risks violating Archboard's single-parent invariant. Evaluate `abort` and
post-merge validation instead.
([Releases](https://github.com/fluree/db/releases),
[current model](https://labs.flur.ee/docs/db),
[branch contract](https://labs.flur.ee/docs/db/cli/branch))

Nameservice compare-and-set coordinates branch heads. HTTP supports a TypeScript
integration without assuming an older SDK matches Rust v4. `.flpack` archives
retain commits and transaction payloads, optionally indexes. Hosted Fluree AI is
advertised as generally available with a free tier and demand-based scaling.
Its required low-level branch APIs, export rights, and
production price remain unconfirmed.
([Concurrency](https://labs.flur.ee/docs/db/concepts/ledgers-and-nameservice),
[archives](https://www.labs.flur.ee/docs/db/operations/pack-archive-restore),
[hosted offer](https://www.flur.ee/solo))

The pinned v4.2.4 license is BUSL-1.1, converting after four years, despite
the June announcement saying three. It prohibits a commercial database service
but expressly permits an application's internal database when its provider
defines the model. Hosted Archboard appears to fit that application exemption.
Tenant-defined schemas or general database provisioning can change the
analysis. Record the exact intended use and resolve that boundary before
selection.
([Actual license](https://github.com/fluree/db/blob/v4.2.4/LICENSE),
[conflicting announcement](https://flur.ee/blog/fluree-launches-verifiable-knowledge-graph-database-for-agentic-ai))

## Bounded evaluation

Use one semantic fixture across candidates. Include nested modules, shared subjects,
cyclic typed dependencies, and ordered flows with a loop. Include two tenants and evidence
pinned to source revisions. For TerminusDB and optionally Fluree, demonstrate:

1. Create two durable proposals from the same base. Test independent edits,
   same-field conflicts, and delete-versus-reference conflicts. Test a structurally
   clean merge that creates a containment cycle.
2. Test concurrent agent writes with expected revisions, lost-response retries,
   stale full-document replacements, and one atomic multi-subject change.
3. Test immediate-child projection, descendant relationship aggregation, and
   historical reconstruction. Rename and reparent subjects while retaining their IDs.
4. Test tenant denial across current reads, history, branch administration, query,
   and export. Restore backups with all proposal heads and IDs.

Record correctness, server/client code required, cold/warm query latency,
storage growth, and an actual hosting quote. Stop a candidate when it requires
rebuilding the proposal engine or cannot demonstrate tenant separation. An XTDB
evaluation must first demonstrate recursive scope resolution and durable proposal
representation. Historical SQL alone does not justify that added product work.
