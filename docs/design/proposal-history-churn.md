# Proposal history and architecture JSON churn

Measured on 2026-10-26 from Git objects only. This is exploratory evidence for a
storage discussion. It selects no redesign and assesses no PR correctness.

The fixed comparison is base `96e6d3ebbc426d0f6112c6afcc861dedbcaa567e` to head
`246c423798748db6b72e60afe643ceb9b9c6a65d`. The base is the confirmed merge base.
The head identifies `feat/reusable-codex-workbench`, PR #2. No live branch or
working-tree content enters the measurements.

## Measured change

Churn means added lines plus deleted lines in this endpoint comparison.
Git rename detection uses its default 50% similarity threshold.

| Scope                           | Added lines | Deleted lines |   Churn |
| ------------------------------- | ----------: | ------------: | ------: |
| All numeric Git numstat entries |     117,103 |        23,989 | 141,092 |
| `.archboard/vault`              |      81,579 |         2,602 |  84,181 |
| Everything outside that vault   |      35,524 |        21,387 |  56,911 |

The vault accounts for 69.7% of added lines and 59.7% of churn. The whole
comparison contains 1,507 file entries, including 12 binary entries without line
counts. The vault contains 14 changed files, all `.semantic.json`. No changed
`.semantic.json` lives outside it.

Both endpoints contain 17 boards with the same 17 stable board IDs. There are
no new or deleted boards. Git detects `Agent workbench.semantic.json` becoming
`Codex realtime voice.semantic.json` with 72% similarity. Both contain board ID
`9ncuT5DP`, so the comparison treats them as one board. The other three boards,
Board rasterizer, Renderer layout, and Semantic renderer, remain unchanged.

## What the changed files contain

A variant is one architectural state. Each variant stores complete `nodes`,
`edges`, `flows`, and `walkthroughs` arrays, rather than a difference from its
parent. The board also stores views, its current variant ID, adoption records,
and shelving records. The [document schema][schema] owns this contract.

These counts cover only the 14 changed boards:

| Stored item or lifecycle  | Base | Head |
| ------------------------- | ---: | ---: |
| Complete variant contents |  280 |  306 |
| Historical variants       |  226 |  252 |
| Current variants          |   14 |   14 |
| Active drafts             |    8 |    8 |
| Shelved variants          |   32 |   32 |
| Adoption records          |  227 |  253 |
| Reconciliation bases      |    0 |    0 |

| Board                                  | Variants at base | Variants at head |
| -------------------------------------- | ---------------: | ---------------: |
| Archboard                              |               14 |               17 |
| Archboard server                       |               68 |               70 |
| Archboard server routes                |               18 |               19 |
| Board persistence                      |               18 |               19 |
| Board viewer                           |               30 |               31 |
| Browser application                    |               17 |               19 |
| Agent workbench → Codex realtime voice |               18 |               21 |
| Codex session                          |                7 |                9 |
| Codex workhorse                        |               15 |               18 |
| Command dispatch                       |               10 |               11 |
| Command interface                      |               28 |               29 |
| Live panes                             |               11 |               13 |
| Skill evaluation                       |                8 |                9 |
| Voice coordinator                      |               18 |               21 |

All 26 added variants appear in adoption records. At head, 12 are historical
and 14 are current. The 14 former current variants become historical. Every
pre-existing variant retains identical parsed content and metadata, except for
those lifecycle changes. No variant is removed.

The eight active drafts remain unchanged. Codex realtime voice holds three,
Codex workhorse and Voice coordinator hold two each, and Browser application
holds one. Therefore, growing draft backlogs do not explain this comparison.
The added snapshots record adopted changes and their intermediate states.

The 306 contents hold 27,183 top-level record occurrences. A record means one
node, edge, flow, or walkthrough, including all its nested fields. Only 5,154
values are distinct within their board and record category. The remaining
22,029 occurrences repeat an equal JSON value elsewhere in that board's
variants. Equality ignores object key order but preserves array order.

The 26 added contents hold 2,773 records. Of those, 1,915 equal their direct
parent's corresponding record, including its ID and every field. Thus 69.1%
of added record occurrences repeat parent values. This is a record count, not
a byte count. It does not mean that whole snapshots are identical or that
repeated values lack historical meaning.

## Current architecture still changes materially

The designated content is the content named by each board's `current` ID,
as [currentVariant][current] defines it. Comparing that content by board ID
and then record ID produces these totals across the changed boards:

| Record category | Base count | Head count | Added IDs | Removed IDs | Modified retained IDs |
| --------------- | ---------: | ---------: | --------: | ----------: | --------------------: |
| Nodes           |        474 |        511 |        37 |           0 |                   130 |
| Edges           |        859 |        938 |        82 |           3 |                   215 |
| Flows           |        108 |        110 |         2 |           0 |                    56 |
| Walkthroughs    |         14 |         14 |         0 |           0 |                     8 |

A modified record has any unequal field. Binding paths, descriptions, anchors,
and nested flow steps all count. These are structural comparisons, not counts
of independent architectural decisions. New IDs do not prove that every
record represents a new runtime component.

Three examples separate model changes from snapshot repetition:

- [Archboard][overview] adds three complete variants, `baipCbd7`, `8B2TXISO`,
  and `kdOMLoqz`. Its file changes by +5,881/-76 lines. Current content grows
  from 37 to 39 nodes and 60 to 65 edges. The new nodes describe the shared
  `codex-realtime-voice` package and the independent workbench example.
  However, the final variant repeats 106 of its parent's 107 records.
  Its complete content occupies 1,915 lines when serialized separately.
- [Codex realtime voice][voice] retains board ID `9ncuT5DP` across its rename.
  Its file changes by +13,345/-1,230 lines and adds three complete variants.
  Current content grows from 41 to 51 nodes and 77 to 92 edges. New records
  describe host policy, public interfaces, the example host, and context
  announcements. Also, 37 retained nodes, 70 retained edges, and all seven
  flows change. This example includes substantial model and binding changes.
  Nevertheless, its last variant repeats 106 of its parent's 151 records.
- [Board persistence][persistence] adds one complete variant, `Hp8NOOeR`,
  with +5,287/-350 file lines. Current content adds four nodes, 18 edges,
  and one flow. The new nodes describe candidate inspection, write
  preparation, rename handling, and variant reads. Its snapshot retains
  107 of its parent's 149 records unchanged.

These examples describe the board models. They do not assess whether every
binding or architectural claim matches the implementation.

## Source mechanisms

[Branch creation][branch] appends a draft with `content: parent.content`.
This shares an object in memory. [Serialization][serialization] writes the
whole board as tab-indented JSON, so each variant's complete content appears
in the file. JSON does not preserve that shared object reference.

[Adoption][adopt] moves `current`, changes the two affected lifecycle values,
and appends an adoption record. It retains previous contents and ancestry.
The measured growth follows this mechanism: complete adopted snapshots remain
alongside the newest designation. It is not repeated modification of all old
snapshot contents.

Reconciliation means merging a proposal with changes to its parent. The
[reconciliation schema][reconciliation] stores another complete content value
as `reconciliation.base` while a disagreement remains. [Propagation][propagate]
uses that value for a three-way comparison and removes standing when settled.
Neither endpoint contains a reconciliation base in the changed boards.
Therefore, this mechanism contributes zero stored bases to the measured
endpoint growth. The comparison cannot establish whether intermediate commits
contained temporary bases.

## Disposable current-content experiment

A projection is a reduced copy for measurement. This experiment writes one
file per stable board ID under `/tmp`. Each file retains `id`, `name`, `level`,
`views`, and only the designated content. It omits variant identity, summaries,
document references, ancestry, historical and shelved readings, active drafts,
adoption records, corrections, timestamps, versions, and former names.

With the same Git line-diff method, the projection changes by +4,451/-1,617
lines across 14 files, or 6,068 lines of churn. That is 92.8% less than the
84,181 lines in the actual vault comparison. For the three examples, projected
changes are Archboard +166/-48, Codex realtime voice +992/-444, and Board
persistence +792/-67.

This difference measures an intentionally reduced artifact. It loses proposal
and decision history that the product preserves. It is not a migration,
a storage benchmark, or guaranteed savings for a design that retains those
capabilities. Stable filenames also avoid path-rename effects. Formatting,
field order, Git matching, and omitted metadata affect the result. Rewriting
a whole JSON file does not mean that Git stores or reports every line anew.
These measurements cover endpoint differences, not cumulative commit churn,
Git object sizes, compression, network cost, or read/write latency.
Deleted lines do not directly count removed model facts. Git can rematch
unchanged JSON around inserted snapshots.

## Reproduce

Run these commands from the repository. They read fixed Git objects and do not
change the checkout. Sum numeric entries and count `-` entries separately.

```bash
base=96e6d3ebbc426d0f6112c6afcc861dedbcaa567e
head=246c423798748db6b72e60afe643ceb9b9c6a65d
git diff --numstat --find-renames "$base" "$head"
git diff --numstat --find-renames "$base" "$head" -- .archboard/vault
git diff --name-status --find-renames "$base" "$head" -- .archboard/vault
git diff --name-only --find-renames "$base" "$head" -- '*.semantic.json'
```

Save this disposable script under `/tmp` and run it with Python 3. It reproduces
the lifecycle, repetition, current-record, and projected-diff measurements.
It creates a fresh temporary directory for each run.

```python
import collections
import json
import pathlib
import subprocess
import tempfile

BASE = "96e6d3ebbc426d0f6112c6afcc861dedbcaa567e"
HEAD = "246c423798748db6b72e60afe643ceb9b9c6a65d"
KINDS = ("nodes", "edges", "flows", "walkthroughs")


def git(*args):
    return subprocess.check_output(["git", *args], text=True)


def boards(sha):
    paths = git("ls-tree", "-r", "--name-only", sha, ".archboard/vault")
    docs = [json.loads(git("show", sha + ":" + p))
            for p in paths.splitlines() if p.endswith(".semantic.json")]
    return {d["id"]: d for d in docs}


def current(d):
    return next(v["content"] for v in d["variants"] if v["id"] == d["current"])


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


a, b = boards(BASE), boards(HEAD)
print("added/removed boards", b.keys() - a.keys(), a.keys() - b.keys())
changed = {i for i in a.keys() | b.keys() if a.get(i) != b.get(i)}
for label, docs in (("base", a), ("head", b)):
    ds = [docs[i] for i in changed if i in docs]
    vs = [v for d in ds for v in d["variants"]]
    occurrences = distinct = 0
    for d in ds:
        records = [(k, canonical(r)) for v in d["variants"]
                   for k in KINDS for r in v["content"][k]]
        occurrences += len(records)
        distinct += len(set(records))
    print(label, "variants per board", {d["name"]: len(d["variants"]) for d in ds})
    print(label, "lifecycle", collections.Counter(v["lifecycle"] for v in vs))
    print("adoptions", sum(len(d.get("adoptions", [])) for d in ds))
    print("bases", sum("reconciliation" in v for v in vs))
    print("records/distinct/repeated", occurrences, distinct, occurrences - distinct)

new = repeated = old_edits = 0
new_lifecycle = collections.Counter()
deltas = collections.Counter()
for i in sorted(changed):
    av = {v["id"]: v for v in a.get(i, {}).get("variants", [])}
    bv = {v["id"]: v for v in b.get(i, {}).get("variants", [])}
    old_edits += sum(av[x]["content"] != bv[x]["content"] for x in av.keys() & bv.keys())
    for x in bv.keys() - av.keys():
        v = bv[x]
        new_lifecycle[v["lifecycle"]] += 1
        assert any(e["variant"] == x for e in b[i].get("adoptions", []))
        parent = bv[v["parent"]]["content"]
        new += sum(len(v["content"][k]) for k in KINDS)
        repeated += sum(r in parent[k] for k in KINDS for r in v["content"][k])
    for k in KINDS:
        aa = {r["id"]: r for r in current(a[i])[k]} if i in a else {}
        bb = {r["id"]: r for r in current(b[i])[k]} if i in b else {}
        for field, value in (("base", len(aa)), ("head", len(bb)),
                             ("added", len(bb.keys() - aa.keys())),
                             ("removed", len(aa.keys() - bb.keys())),
                             ("modified", sum(aa[x] != bb[x] for x in aa.keys() & bb.keys()))):
            deltas[k, field] += value
print("new lifecycle", new_lifecycle, "old content edits", old_edits)
print("new records/unchanged from parent", new, repeated)
print("current record deltas", dict(deltas))

root = pathlib.Path(tempfile.mkdtemp(prefix="archboard-churn-", dir="/tmp"))
for label, docs in (("base", a), ("head", b)):
    target = root / label
    target.mkdir()
    for i, d in docs.items():
        projection = {k: d[k] for k in ("id", "name", "level", "views")}
        projection["content"] = current(d) if d.get("current") else None
        (target / (i + ".json")).write_text(
            json.dumps(projection, ensure_ascii=False, indent="\t") + "\n")
result = subprocess.run(["git", "diff", "--no-index", "--numstat", "--find-renames",
                         str(root / "base"), str(root / "head")],
                        text=True, capture_output=True)
assert result.returncode in (0, 1), result.stderr
print(result.stdout)
rows = [line.split("\t") for line in result.stdout.splitlines()]
print("projection added/deleted", sum(int(r[0]) for r in rows), sum(int(r[1]) for r in rows))
```

The current-record loop assumes that each present board has a designated
variant. All 17 boards meet that condition at both fixed endpoints. The
projection explicitly represents an undesignated board with null content.
Do not infer coverage of other revisions or proposal-only repositories.

[schema]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/shared/schemas/board-document.ts#L114-L255
[current]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/shared/schemas/board-document.ts#L273-L280
[branch]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/runtime/operations/write/transitions.ts#L220-L267
[serialization]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/runtime/operations/rename/relocation.ts#L204-L212
[adopt]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/runtime/operations/variant/adopt.ts#L35-L58
[reconciliation]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/shared/schemas/reconciliation.ts#L86-L140
[propagate]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/packages/board/src/runtime/operations/variant/propagate.ts#L197-L228
[overview]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/.archboard/vault/Archboard.semantic.json#L9240
[voice]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/.archboard/vault/Codex%20realtime%20voice.semantic.json#L33795
[persistence]: https://github.com/miklschmidt/archboard/blob/246c423798748db6b72e60afe643ceb9b9c6a65d/.archboard/vault/Board%20persistence.semantic.json#L34922
