# CLI workflow chains

Use `archboard help <command>` first for released syntax and options. For result
shapes, streams, exits, and refinements, follow the registry in
`src/cli/commands/run.ts` to that command's `ResultSchema` and inferred type.
Those source Zod contracts are authoritative.

For a searchable view, generate
`docs/design/generated/command-contract-proof.json` on demand with
`bun run generate:cli-contract`. The file is ignored and derived; when it and
the source disagree, the source Zod schema and refinements win.

The examples below extract only values that naturally feed a later released
command. They are tested against results accepted by the producing contract.

## Created and queried elements

Take element IDs from `add` or `query`, then choose the IDs needed by
`promote` or an `arrange` operation.

<!-- tested-jq: add-element-ids -->

```jq
[.elements[].id]
```

<!-- tested-jq: query-element-ids -->

```jq
[.[].id]
```

For example, turn the selected JSON array into the comma-separated argument
expected by a later command:

```bash
ids="$(jq -r 'join(",")' <<<"$selected_ids")"
archboard promote --board "$board" --doing "promoting selected elements" --ids "$ids" --kind service
archboard arrange align --board "$board" --doing "aligning selected elements" --ids "$ids" --to left
```

## Stencils, nodes, and groups

`library insert` returns the inserted element IDs. It does not promise a
library handle or bounds for later use.

<!-- tested-jq: library-element-ids -->

```jq
[.elements[].id]
```

After `promote`, reuse a returned node identity with `promote --node` only when
the next promotion is meant to join that same architecture node.

<!-- tested-jq: promoted-node-ids -->

```jq
[.nodes[] | select(.node != null) | .node]
```

The identity returned by `arrange group` is the input to `arrange ungroup`.

<!-- tested-jq: group-id -->

```jq
.groupId
```

```bash
archboard arrange ungroup --board "$board" --doing "ungrouping selected elements" --group "$group_id"
```

## Independent writes and board versions

A write receipt's board version belongs on the next independent write as
`--expect-version`. Under a claim, the canvas already remembers the version it
last showed that writer.

<!-- tested-jq: fingerprint-version -->

```jq
.fingerprint.version
```

```bash
archboard update "$element_id" --board "$board" --doing "updating the element" --expect-version "$version" --set "$patch"
```

## Inspection and connector bridges

`check` can identify unmarked connector crossings. The two connector IDs are
evidence for a human decision, not an automatic bridge instruction: choose
which connector goes over and which goes under before calling `bridge`.

<!-- tested-jq: crossing-connector-ids -->

```jq
[
  .findings[]
  | select(.code == "CONNECTOR_INTERSECTION_UNMARKED")
  | [.details.firstConnectorId, .details.secondConnectorId]
]
```

```bash
archboard bridge --board "$board" --doing "marking the chosen crossing" \
  --over "$over_id" --under "$under_id" --background '#ffffff'
```

The created bridge identity is the input to `bridge remove`.

<!-- tested-jq: bridge-id -->

```jq
.bridgeId
```

```bash
archboard bridge remove "$bridge_id" --board "$board" --doing "removing the crossing marker"
```

Do not pipe a `check` report into `render-findings`. Rendering repeats
inspection against one named persisted snapshot and accepts the same policy
options explicitly.

## Focused finding files

Each rendered entry's file is relative to the output directory supplied to
`render-findings`.

<!-- tested-jq: rendered-relative-files -->

```jq
[.entries[] | select(.status == "rendered") | .file]
```

```bash
artifact="$output_dir/$relative_file"
```

## Strict inspection capture

Strict `check` deliberately returns its report on stdout for exits 6, 7, and 8. Capture the stream separately from the status so `set -e` does not discard
the report.

<!-- tested-shell: strict-check-capture -->

```bash
check_output="$(mktemp)"
trap 'rm -f "$check_output"' EXIT
if archboard check --board "$board" --strict >"$check_output"; then
  check_status=0
else
  check_status=$?
fi
case "$check_status" in
  0|6|7|8) cat "$check_output" ;;
  *) exit "$check_status" ;;
esac
```
