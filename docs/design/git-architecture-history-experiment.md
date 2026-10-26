# Git architecture history experiment

An ordinary `archboard-history` branch retained old architecture and a shelved
proposal independently of code history in this local experiment. A named branch
reference and its commit ancestry kept the required objects alive. JSON strings
that contained commit hashes did not retain those commits.

Measured on 2026-10-26 with Git 2.55.0 and Python 3. This report supplies evidence
for a storage discussion. It selects no product design and implements no
Archboard functionality. The existing architecture boards and consumer skill
remain accurate because this experiment changes neither behavior nor architecture.

## Scope and disposable evidence

Every experimental repository lived under this newly created directory:

```text
/tmp/archboard-git-history-TH2kXKOI/
  experiment.py                 Executed harness
  commands.jsonl                Commands, standard input, output, and exit status
  results.json                  Assertions and observed results
  baseline-model.json           Old model read from Git
  reconstructed-proposal.json   Proposal reconstructed from Git
  origin.git/                   Bare local remote
  writer/                       Initial author
  writer-b/                     Second archive author
  ordinary/                     Ordinary reader clone
  shallow-main/                 Shallow reader clone
```

The harness completed with exit status 0 after 212 Git invocations. Its Git
wrapper refused any working directory outside the scratch root. Every remote
URL used `file:///tmp/archboard-git-history-TH2kXKOI/origin.git`. No experimental
operation used the Archboard repository or an external remote.

The harness excluded global and system Git configuration. It supplied a test
author identity through environment variables. Each Git invocation included
`-c core.hooksPath=/dev/null -c gc.auto=0 -c maintenance.auto=false`.
`GIT_OPTIONAL_LOCKS=0` prevented optional index refreshes during inspection.
These controls applied only to disposable processes and repositories.

The `/tmp` evidence remains available for inspection but is disposable. This
report preserves the artifact shapes, object identities, commands, and outcomes.
It does not depend on a permanent copy of that directory.

## Fixtures and archive construction

A baseline is the retained model that a proposal changes. A checkpoint is an
archive commit that contains a coherent model and proposal records. A ref is a
named pointer to a Git object. Commit ancestry follows actual parent links.

The fixture followed the proposed module and flow split in
[Architecture discovery and interaction](architecture-discovery-and-interaction.md#module-and-flow-files).
That document describes intended behavior. These experimental files are not
fixtures for a shipped `.module.json` or `.flows.json` parser.

The initial `main` commit contained `service.txt` and three architecture files.
The following object maps each filename to its JSON contents:

```json
{
	"architecture/gateway.module.json": {
		"id": "gateway",
		"kind": "service",
		"name": "Gateway",
		"responsibility": "Route reads to the store.",
		"relationships": [{ "id": "reads", "kind": "calls", "target": "store" }]
	},
	"architecture/store.module.json": {
		"id": "store",
		"kind": "database",
		"name": "Store",
		"responsibility": "Keep request data.",
		"relationships": []
	},
	"architecture/request.flows.json": {
		"flows": [
			{
				"id": "request",
				"name": "Read request",
				"steps": [
					{
						"id": "read",
						"source": "gateway",
						"target": "store",
						"relationship": "reads"
					}
				]
			}
		]
	}
}
```

The harness serialized each file with `json.dumps(value, indent=2, sort_keys=True)`
and a final newline. Its assertions resolved relationship targets and flow
participants by module ID. Each flow step also matched its source relationship
and target. These assertions establish coherence for this small fixture only.

The setup used these commands, with paths abbreviated through `root`:

```bash
root=/tmp/archboard-git-history-TH2kXKOI
git -C "$root" init --bare --initial-branch=main "$root/origin.git"
git -C "$root" init --initial-branch=main "$root/writer"
git -C "$root/writer" remote add origin "file://$root/origin.git"
# After writing the three JSON files and service.txt:
git -C "$root/writer" add .
git -C "$root/writer" commit -m 'test: seed current architecture and code'
git -C "$root/writer" push -u origin main
```

For archive commits, the harness wrote each file through
`git hash-object -w --stdin`. It assembled directories from those blob IDs with
`git mktree`. A blob holds file contents, and a tree records filenames and object
IDs. The constructor supplied `100644 blob <id>\t<name>` for files and
`040000 tree <id>\t<name>` for directories. It did not use the worktree or index.
[Git documents the tree input format](https://git-scm.com/docs/git-mktree).

The first archive tree contained exactly the three architecture files. The
harness created its root commit with `git commit-tree <tree> -m <message>` and no
`-p` argument. It installed that commit at `refs/heads/archboard-history` with
`git update-ref`, then pushed that named branch normally. A root commit has no
parents. [Git documents root and parent construction](https://git-scm.com/docs/git-commit-tree).

The retained identities were:

```text
B baseline       8a109450c24fc8e2b6ee4f5aa4fb1740721eb57a
C checkpoint     bf9644c2b74ec5f0a4b9481d069d88f2c16358d9
A writer A       98871188ef22027362787ef0babc1fa036cfd2a1
D writer B       d91756db9304101449378435f62d63095f6ec67e
M archive merge  37a916565993592940609a7cf90cb0a283d7daad

Initial main     35f3d400fa46089b573506651e5b27f3a2c211cb
Squashed code    a40837e89b854c174528fbe9b39228a5aa9f6684
Final main       76d48556563bbd91aa1a002fc29d40eeeed77e74
Feature commit 1 73e618aad2242e94cf31d4c2f94da3bb1fda372a
Feature commit 2 770e5ce9b6785dfea0a523ce97eba0200b4326a4
JSON-only probe  b6d4965447a69fcdbbc28b115d8a6bd4f01e4d05
```

`git rev-list --parents -n 1 B` returned only B. `git merge-base main
refs/heads/archboard-history` returned exit status 1 because the histories shared
no ancestor. The archive root contained no `service.txt` or code commit parent.

## Shelved proposal and reconstruction

The harness advanced the current Gateway responsibility on `main` to
`Route reads and record timing.` It put that current model in checkpoint C.
C retained B as its actual parent through `git commit-tree <tree> -p B`.
The older Gateway contents therefore lived in B, even though C replaced that
file. The archive did not retain another baseline copy inside proposal JSON.

C also contained `proposals/cache.patch.json`, a 166-byte replacement record:

```json
{
	"after": "Route cached reads to the store.",
	"before": "Route reads to the store.",
	"field": "responsibility",
	"file": "architecture/gateway.module.json"
}
```

This patch format serves this experiment. It handles one top-level field
replacement and requires the expected old value. It is not an Archboard API or
a general JSON patch implementation.

The accompanying `proposals/cache.json` contained:

```json
{
	"baselineCommit": "8a109450c24fc8e2b6ee4f5aa4fb1740721eb57a",
	"id": "cache",
	"lifecycle": "shelved",
	"patch": "proposals/cache.patch.json",
	"reason": "Cache work is deferred.",
	"sourceCodeCommit": "770e5ce9b6785dfea0a523ce97eba0200b4326a4",
	"unretainedProbeCommit": "b6d4965447a69fcdbbc28b115d8a6bd4f01e4d05"
}
```

The harness read C's metadata, made sure that B was an ancestor of C, and read
every architecture file from B. It applied the replacement in Python memory.
The resulting model matched an independently prepared expected value. Its
Gateway responsibility was `Route cached reads to the store.` The relationship
and flow still resolved. Separately, C's current model matched the final model
on `main`, with the timing responsibility instead.

The object reads used these commands in each reader repository:

```bash
baseline=8a109450c24fc8e2b6ee4f5aa4fb1740721eb57a
checkpoint=bf9644c2b74ec5f0a4b9481d069d88f2c16358d9
git merge-base --is-ancestor "$baseline" "$checkpoint"
git ls-tree -r --name-only "$baseline" -- architecture
git show "$baseline:architecture/gateway.module.json"
git show "$baseline:architecture/store.module.json"
git show "$baseline:architecture/request.flows.json"
git show "$checkpoint:proposals/cache.json"
git show "$checkpoint:proposals/cache.patch.json"
```

`<commit>:<path>` addresses the object at that path in the commit tree.
`git show` returns a blob's contents. These commands require no archive checkout.
[Git revision syntax](https://git-scm.com/docs/gitrevisions#_specifying_revisions)
and [git-show](https://git-scm.com/docs/git-show) define these reads.

Before reading in `ordinary`, the harness created staged, unstaged, and untracked
sentinels. It compared HEAD, status, and SHA-256 hashes of every worktree file
and the index before and after reconstruction. Every value stayed equal.
The index SHA-256 remained
`a29fece0a9711103122a2964e3c728159d9529027c516bbf8e9bab450cc88e4e`.
The status remained `AM reader.txt` and `?? untracked.txt`. The harness wrote its
reconstructed output outside the clone, directly under the scratch root.

## Squash, branch deletion, and garbage collection

The harness created and pushed `code-feature` with two code commits. It then
used these commands in the disposable writer:

```bash
git switch main
git merge --squash code-feature
git commit -m 'test: squash code feature'
# The separate current-architecture commit followed, then main was pushed.
git push origin main
git branch -D code-feature
git push origin --delete code-feature
```

The squash commit had only the initial main commit as its parent. The archive
commits had no code feature parents. The harness also created an unrelated
probe commit without any ref. Only a JSON string mentioned its hash.

After branch deletion, the harness ran these commands in `writer` and
`origin.git`, with no concurrent writers:

```bash
git reflog expire --expire=now --expire-unreachable=now --all
git gc --prune=now
```

Reflogs record former reference values. Expiration removed their retention
role in this test. Git documents [reflog expiration](https://git-scm.com/docs/git-reflog#_options)
and [garbage collection retention](https://git-scm.com/docs/git-gc#_notes).

Both repositories still resolved B and C through `git cat-file -e <id>^{commit}`
with exit status 0. Both reconstructed the proposal successfully. Both lost
the two original feature commits, with object reads returning exit status 128.
The writer also lost the previously present probe commit. The remote never
received that probe object because no pushed Git link reached it.

The proposal metadata still contained the feature and probe hashes. Those
strings did not retain the corresponding objects. B survived because C's
parent link reached B and the archive branch reached C. The bare remote had
only `main` and `archboard-history` branch heads, without extra retention refs.
Git's collector follows Git references and object links, not application JSON.
[Git describes retained reference roots](https://git-scm.com/docs/git-gc#_notes).

The final `main` tree contained only the three current architecture files and
`service.txt`. Its JSON contained no snapshots, proposal records, or archive
manifest. Normal Git history still retained earlier versions of current files.
This experiment moved explicit architecture snapshots and the shelved proposal
to the independent archive history.

## Concurrent appends and recovery

The concurrency experiment used two independent repositories at checkpoint C.
Writer A appended
`events/a.json` as commit A. Writer B independently appended `events/b.json` as
commit D, also with parent C. These disjoint records tested Git coordination,
not concurrent semantic edits to one architecture subject.

A's ordinary push succeeded. B's stale push returned exit status 1:

```text
 ! [rejected]        archboard-history -> archboard-history (fetch first)
```

The remote tip remained A. This was a rejected update that did not advance from
the remote's current history. Git documents [fast-forward push rules](https://git-scm.com/docs/git-push#_note_about_fast_forwards).
A fast-forward moves a ref to a descendant commit.

Writer B recovered with the following operations. `append_b` names D and
`append_a` names A from the identity block above:

```bash
git fetch origin refs/heads/archboard-history:refs/remotes/origin/archboard-history
merged_tree=$(git merge-tree --write-tree "$append_b" refs/remotes/origin/archboard-history)
merged_commit=$(git commit-tree "$merged_tree" -p "$append_b" -p "$append_a" \
  -m 'archive: preserve both concurrent appends')
git update-ref refs/heads/archboard-history "$merged_commit" "$append_b"
git push origin refs/heads/archboard-history:refs/heads/archboard-history
```

`git merge-tree --write-tree` computes a merged tree without the index or
worktree. `git commit-tree` then created M with D and A as its parents.
[Git documents this merge operation](https://git-scm.com/docs/git-merge-tree)
and [multiple commit parents](https://git-scm.com/docs/git-commit-tree).

The recovery push succeeded without a force flag or a `+` push refspec. Both A
and D remained ancestors of M. Both event files remained in M's tree. The
remote archive contained five commits: B, C, A, D, and M. A second remote
collection retained them, and `git fsck --full` returned exit status 0.

The remote branch advanced from B to C to A to M without rewriting an accepted
commit. The merge retained D's identity as well. This tests one stale-writer
recovery with disjoint files. It does not establish automatic recovery from
semantic conflicts or an endlessly contested branch.

## Ordinary and shallow clones

After remote collection, an ordinary clone used:

```bash
git -C "$root" clone "file://$root/origin.git" "$root/ordinary"
```

Its HEAD selected `main`. Its remote references included `origin/main` and
`origin/archboard-history`, with the latter pointing to M. It contained all
five archive commits, including B and C. Old model reads and proposal
reconstruction succeeded without switching branches.

Git normally creates remote references for the remote's branches. A `file://`
URL uses Git transport instead of the local hardlink optimization. The
experiment used neither alternates nor a shared object store.
[Git documents clone behavior and local transport](https://git-scm.com/docs/git-clone).

The shallow clone used:

```bash
git -C "$root" clone --depth=1 --single-branch --branch main \
  "file://$root/origin.git" "$root/shallow-main"
```

A shallow clone contains a truncated commit history. This clone initially had
only the final main commit. Its fetch mapping was
`+refs/heads/main:refs/remotes/origin/main`. The archive reference was absent.
Both B and C were absent as objects, with `git cat-file` returning 128.
Git documents the [depth and single-branch controls](https://git-scm.com/docs/git-clone#Documentation/git-clone.txt---depthltdepthgt).

The explicit repair fetched a named branch into a named remote reference:

```bash
git -C "$root/shallow-main" fetch origin \
  refs/heads/archboard-history:refs/remotes/origin/archboard-history
```

This fetch supplied all five archive commits, including checkpoint C and its
ancestor baseline B. The command used no depth limit, bare SHA source, or empty
destination. The existing shallow boundary on `main` did not truncate this
independent archive history in the tested Git version. The clone still reported
itself as shallow, and its main history still contained one commit.

A fetch refspec maps a remote source ref to a local destination ref. Git
documents this [source and destination behavior](https://git-scm.com/docs/git-fetch#Documentation/git-fetch.txt-ltrefspecgt).
A one-time explicit mapping does not broaden the stored main-only fetch mapping.
Later archive updates require another explicit fetch or a deliberate fetch
configuration change. The latter configuration change was not tested.

The harness then overwrote `FETCH_HEAD` with a main-only fetch:

```bash
git -C "$root/shallow-main" fetch origin refs/heads/main:refs/remotes/origin/main
git -C "$root/shallow-main" reflog expire --expire=now --expire-unreachable=now --all
git -C "$root/shallow-main" gc --prune=now
```

`FETCH_HEAD` then named only main. The named archive reference still reached M,
C, and B. Both required objects survived collection, and proposal reconstruction
succeeded again. HEAD, worktree file hashes, the index hash, and status stayed
equal across these fetches, collection, and reads.

## Limits and unanswered product questions

The observed retention depends on a surviving reference and complete ancestor
history. This ordinary branch is append-only by convention in the experiment.
No branch protection, deletion restriction, or force-push restriction was
installed. Deleting the last retaining reference or rewriting its ancestry can
remove the retention basis. Remote deletion and pruning can also remove local
remote references. [Git documents push overrides](https://git-scm.com/docs/git-push#_push_rules)
and [fetch pruning](https://git-scm.com/docs/git-fetch#_pruning).

Git does not make main and archive writes one application transaction. The
experiment did not test crash recovery between those writes, access control,
hosting restrictions, backups, or restoration after archive branch deletion.
It provides no production retention guarantee. It tested a code squash and
branch deletion, not code rebasing or an archive rewrite.

A Git tree supplied a consistent file set, but the harness supplied the meaning
of its references. Git did not enforce module ownership, flow validity, proposal
lifecycle, or the requirement that a baseline be an ancestor. The test did not
cover a multi-file proposal, conflicting replacements, migrations, walkthroughs,
or bindings to unavailable source code. The collected feature commit also
shows that architecture retention alone does not preserve referenced code.

The experiment measured no storage size, compression ratio, latency, scale, or
repository host behavior. It supplies no comparison with another storage
engine. Its evidence establishes the tested Git mechanics, while the product
contract and storage choice remain open.
