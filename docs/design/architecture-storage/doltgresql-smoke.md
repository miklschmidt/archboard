# DoltgreSQL 1.4.0 functional smoke experiment

On 2026-10-25, a disposable DoltgreSQL server completed the small graph,
proposal, and merge operations below. This supports further evaluation for
TASK-543. It establishes no performance, production-readiness, or isolation claim.

## Environment and bounds

The server used the official [v1.4.0 Linux amd64 release](https://github.com/dolthub/doltgresql/releases/tag/v1.4.0).
The downloaded archive contained 50,733,330 bytes. Its locally calculated SHA-256
was `3868d1293ce6b24680d29c31a8661a913656459e02c3ef8f61cb737908d6d667`.
This digest records the downloaded bytes. No separate publisher digest was compared.
Archive inspection found only directories and regular files under
`doltgresql-linux-amd64`, with no absolute paths or parent traversal.

`doltgres --version` returned `Doltgres version 1.4.0`.
`SELECT version(), dolt_version(), active_branch()` returned:

```json
[{ "version": "PostgreSQL 15.5", "dolt_version": "1.4.0", "active_branch": "main" }]
```

The PostgreSQL version string describes the reported compatibility surface.
It does not establish that all PostgreSQL 15.5 features work.
The client was Bun 1.4.3 with its built-in PostgreSQL `SQL` client, limited to
one connection. No repository dependency or global executable was installed.
The server stored its databases, configuration, and logs in a new temporary
directory. `ss -ltnp` showed only `127.0.0.1:52143`, owned by the experiment's
`doltgres` process. The fixture contained four modules and one dependency edge.

Configuration followed the official [server guide](https://www.doltgres.com/docs/reference/server/).
The binary's `--help` and `-config-help` listed the configuration fields.
The SQL followed the official [version-control functions](https://www.doltgres.com/docs/reference/version-control/dolt-sql-functions/)
and [merge transaction guidance](https://www.doltgres.com/docs/reference/version-control/merges/).
The client used the documented [Bun SQL API](https://bun.com/docs/runtime/sql).
These sources were consulted on 2026-10-25.

## Observed results

| Operation                   | Observed output                                                                                                                                            | Limit of the observation                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Canonical modules and edges | Primary-key tables, module-parent reference, and edge-endpoint references were created. The dependency joined to the `auth` definition.                    | No complete Archboard schema, migration, or multiple-reading UI was exercised.                          |
| Recursive containment       | `arch` at depth 0, `auth` and `pay` at depth 1, `token` at depth 2.                                                                                        | Four rows, no query plan or timing measurement.                                                         |
| Proposal branch             | A committed `auth` edit on `proposal` left `main` at `Authenticate callers`.                                                                               | One serial connection, no concurrent writers.                                                           |
| Divergent, disjoint edits   | `dolt_merge` returned `fast_forward=0`, `conflicts=0`, `message=merge successful`. Both changes survived.                                                  | Different rows of one table, no schema merge or same-row disjoint-column merge.                         |
| Same-field conflict         | `dolt_merge` returned `fast_forward=0`, `conflicts=1`. `dolt.conflicts` reported one conflict in `modules`.                                                | The conflict was inspected and rolled back, not resolved and committed.                                 |
| Semantic containment cycle  | The database accepted `arch.parent_id = token`, despite the foreign key and direct-self-parent check. A bounded recursive query found three cycle members. | This fixture needs application-owned graph validation. No general production validator was implemented. |

The baseline commit was `jeu9mp2fhfav7e4cngk5sg7h0l6t16ld`.
The successful three-way merge commit was `07ml9ri4ii4rkn4ho6um7usq022tt3mv`.
These hashes identify this disposable run. Reproduction creates different hashes.
The merged rows were:

```json
[
	{ "id": "auth", "responsibility": "Authenticate callers and services" },
	{ "id": "pay", "responsibility": "Take and refund payments" }
]
```

The conflict row exposed `base_responsibility`, `our_responsibility`, and
`their_responsibility`, with these respective values:

```text
Authenticate callers and services
Authenticate with certificates
Authenticate with passkeys
```

After the attempted cycle, the stored parent rows and cycle query returned:

```json
[{"id":"arch","parent_id":"token"},{"id":"auth","parent_id":"arch"},{"id":"pay","parent_id":"arch"},{"id":"token","parent_id":"auth"}]
[{"origin":"arch","id":"arch","depth":3},{"origin":"auth","id":"auth","depth":3},{"origin":"token","id":"token","depth":3}]
```

A foreign key makes the parent exist. A direct-self-parent check prevents one
row from pointing to itself. Neither expresses the graph-wide acyclicity rule.
Version-control merge success therefore cannot certify architectural validity.
The application must validate its semantic rules before accepting a proposal.

All SQL statements completed without an error. The script rolled back the
conflicting merge and restored the root's null parent. Final `SELECT * FROM
dolt.status` returned `[]`. The owner sent `SIGTERM` to its own server process.
The process exited with status 0, its log reported the listener closing, and
`ss -ltnp` showed no remaining listener on port 52143. Logs, script, configuration, and release metadata were retained outside the
repository for inspection. The downloaded archive, binary, and disposable database
files were removed.

## Not exercised

This experiment did not measure latency, throughput, memory, or disk growth.
It did not exercise large histories, deep graphs, concurrent sessions, or
transaction conflict recovery. Crash recovery, replication, backup restoration,
tenant isolation, branch permissions, remote hosting, and PostgreSQL extension
compatibility remain untested.
It did not test parameterized statements, connection pooling beyond one
connection, or arbitrary client compatibility.

The experiment did not use row-level security or establish a safe tenant model.
The official [supported-command list](https://www.doltgres.com/docs/reference/sql-support/supported-commands/)
marks `CREATE POLICY` unsupported. The vendor's [October roadmap update](https://www.dolthub.com/blog/2026-10-07-roadmap-update/)
describes row-level security as work in progress. That roadmap is not evidence
that this release enforces it.

The default startup emitted a `secure_file_priv` warning about filesystem access
for roles with `GRANT FILE`. This disposable loopback run did not assess or
harden production privileges. No hosted service or external credential was used.

## Reproduce

Use Linux amd64 with Python 3.12 or later, `curl`, and Bun 1.4.3.
Start in a disposable shell. This recipe keeps the binary and databases outside
the checkout. The selected port can race with another process before startup.
If startup fails, inspect `server.log` and choose another unused port.

```bash
run_dir=$(mktemp -d /tmp/task543-doltgresql-smoke.XXXXXX)
export DOLT_SMOKE_DIR="$run_dir"
curl -fL --retry 1 -o "$run_dir/release.tar.gz" \
  https://github.com/dolthub/doltgresql/releases/download/v1.4.0/doltgresql-linux-amd64.tar.gz
python3 - <<'PYSETUP'
import os, pathlib, socket, tarfile
p = pathlib.Path(os.environ['DOLT_SMOKE_DIR'])
with tarfile.open(p / 'release.tar.gz') as archive:
    for member in archive:
        path = pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts
        assert member.isfile() or member.isdir()
    archive.extractall(p, filter='data')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
(p / 'port').write_text(str(port))
(p / 'config.yaml').write_text(f'''log_level: info
listener:
  host: 127.0.0.1
  port: {port}
data_dir: {p}/data
cfg_dir: {p}/cfg
privilege_file: {p}/cfg/privileges.db
auth_file: {p}/cfg/auth.db
branch_control_file: {p}/cfg/branch_control.db
''')
PYSETUP
"$run_dir/doltgresql-linux-amd64/bin/doltgres" --version
(
  cd "$run_dir"
  exec ./doltgresql-linux-amd64/bin/doltgres --config ./config.yaml
) > "$run_dir/server.log" 2>&1 &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true' EXIT
```

Wait for `Server ready. Accepting connections.` in `server.log`.
Save the following exact experiment script as `$run_dir/smoke.ts`.
`optional` records errors for exploratory statements, so inspect the transcript
as well as the exit status. This run produced no such errors.

```typescript
import { SQL } from "bun";
const sql = new SQL(process.env.DOLT_SMOKE_URL!, { max: 1 });
async function q(label: string, statement: string) {
	console.log(`\n-- ${label}\n${statement}`);
	const result = await sql.unsafe(statement);
	console.log(JSON.stringify(result));
	return result;
}
async function optional(label: string, statement: string) {
	try {
		return await q(label, statement);
	} catch (e: any) {
		console.log(JSON.stringify({ error: e.message, code: e.code }));
	}
}
const commit = (message: string) =>
	q(
		message,
		`SELECT * FROM dolt_commit('-Am', '${message}', '--author', 'Archboard Smoke <smoke@example.invalid>')`,
	);
try {
	await q("versions", "SELECT version(), dolt_version(), active_branch()");
	await q(
		"canonical definitions",
		`CREATE TABLE modules (
    id VARCHAR(8) PRIMARY KEY,
    name TEXT NOT NULL,
    responsibility TEXT NOT NULL,
    parent_id VARCHAR(8) REFERENCES modules(id),
    CHECK (parent_id <> id)
  )`,
	);
	await q(
		"canonical relationships",
		`CREATE TABLE edges (
    id VARCHAR(8) PRIMARY KEY,
    source_id VARCHAR(8) NOT NULL REFERENCES modules(id),
    target_id VARCHAR(8) NOT NULL REFERENCES modules(id),
    kind TEXT NOT NULL
  )`,
	);
	await q("root", "INSERT INTO modules VALUES ('arch', 'Architecture', 'Root', NULL)");
	await q(
		"children",
		"INSERT INTO modules VALUES ('auth', 'Authentication', 'Authenticate callers', 'arch'), ('pay', 'Payments', 'Take payments', 'arch')",
	);
	await q("grandchild", "INSERT INTO modules VALUES ('token', 'Tokens', 'Issue tokens', 'auth')");
	await q("dependency", "INSERT INTO edges VALUES ('usesauth', 'pay', 'auth', 'depends-on')");
	await optional(
		"recursive containment",
		`WITH RECURSIVE descendants AS (
    SELECT id, parent_id, 0 AS depth FROM modules WHERE id = 'arch'
    UNION ALL
    SELECT m.id, m.parent_id, d.depth + 1 FROM modules m JOIN descendants d ON m.parent_id = d.id
  ) SELECT * FROM descendants ORDER BY depth, id`,
	);
	await q(
		"two appearances share one subject",
		"SELECT e.source_id, m.id, m.name, m.responsibility FROM edges e JOIN modules m ON e.target_id = m.id",
	);
	await commit("canonical baseline");
	await q("proposal branch", "SELECT * FROM dolt_checkout('-b', 'proposal')");
	await q(
		"proposal changes canonical subject",
		"UPDATE modules SET responsibility = 'Authenticate callers and services' WHERE id = 'auth'",
	);
	await commit("proposal edits auth");
	await q("return main", "SELECT * FROM dolt_checkout('main')");
	await q("main stays unchanged", "SELECT id, responsibility FROM modules WHERE id = 'auth'");
	await q(
		"disjoint main change",
		"UPDATE modules SET responsibility = 'Take and refund payments' WHERE id = 'pay'",
	);
	await commit("main edits payments");
	await q(
		"three way merge",
		"SELECT * FROM dolt_merge('proposal', '-m', 'merge proposal', '--author', 'Archboard Smoke <smoke@example.invalid>')",
	);
	await q(
		"both disjoint changes survive",
		"SELECT id, responsibility FROM modules WHERE id IN ('auth', 'pay') ORDER BY id",
	);
	await q("conflict branch", "SELECT * FROM dolt_checkout('-b', 'conflict')");
	await q(
		"conflict branch edits auth",
		"UPDATE modules SET responsibility = 'Authenticate with passkeys' WHERE id = 'auth'",
	);
	await commit("conflict edits auth");
	await q("return main again", "SELECT * FROM dolt_checkout('main')");
	await q(
		"main edits same auth field",
		"UPDATE modules SET responsibility = 'Authenticate with certificates' WHERE id = 'auth'",
	);
	await commit("main edits same auth");
	await q("begin conflict inspection", "START TRANSACTION");
	await optional(
		"conflicting three way merge",
		"SELECT * FROM dolt_merge('conflict', '-m', 'conflicting merge', '--author', 'Archboard Smoke <smoke@example.invalid>')",
	);
	await optional("conflict table", "SELECT * FROM dolt.conflicts");
	await optional("conflicting row values", "SELECT * FROM dolt_conflicts_modules");
	await q("discard conflict transaction", "ROLLBACK");
	await q(
		"semantic cycle accepted by SQL constraints",
		"UPDATE modules SET parent_id = 'token' WHERE id = 'arch'",
	);
	await q("stored cycle", "SELECT id, parent_id FROM modules ORDER BY id");
	await optional(
		"bounded validator finds cycle",
		`WITH RECURSIVE walk AS (
    SELECT id AS origin, id, parent_id, 0 AS depth FROM modules
    UNION ALL
    SELECT w.origin, m.id, m.parent_id, w.depth + 1 FROM walk w JOIN modules m ON m.id = w.parent_id WHERE w.depth < 4
  ) SELECT origin, id, depth FROM walk WHERE origin = id AND depth > 0 ORDER BY origin, depth`,
	);
	await q("repair cycle", "UPDATE modules SET parent_id = NULL WHERE id = 'arch'");
	await q("final status", "SELECT * FROM dolt.status");
} finally {
	await sql.close();
}
```

Run the script in the disposable shell from the previous step.
Retain its output.
Stop only the server that this shell owns:

```bash
port=$(cat "$run_dir/port")
DOLT_SMOKE_URL="postgres://postgres:password@127.0.0.1:$port/postgres" \
  bun "$run_dir/smoke.ts" > "$run_dir/transcript.log" 2>&1
cat "$run_dir/transcript.log"
kill -TERM "$server_pid"
wait "$server_pid"
trap - EXIT
```

The `two appearances share one subject` label in the script names a canonical
reference join. The fixture has one edge. It does not exercise two distinct
readings or prove their presentation behavior.
