# Element metadata carries the semantic model, namespaced under `archboard`

A node's meaning lives in the element's own `customData`, namespaced as
`customData.archboard`. That meaning includes its kind, its binding to code and
the variant it belongs to. A code binding persists as
`customData.archboard.binding`. The binding holds the repository identity and
the repo-relative path. When available, branch, commit and confirmed-at details
also belong to the binding. Machine-local targets such as `file://` URLs derive
from that binding. They appear only in an element presented to a browser or
caller. They are stripped before the note is written.

`customData` and human-authored Excalidraw `link` values both survive the full
round trip. The round trip includes a human dragging the element in the browser.
We verified this before we committed to the decision. Because of that survival,
archboard preserves unrelated board and web links. It keeps binding-derived code
links out of the persisted note.

The metadata is namespaced because the Obsidian Excalidraw plugin writes its own
top-level `customData` keys, `latex` among others. Flat names such as `node` or
`path` will eventually collide with them.

## Considered Options

A sidecar mapping file (element id to metadata) was rejected. Element ids are
not stable across redraws, mermaid conversion, or variant authoring. The sidecar
therefore drifts silently, and there is no way to detect the drift.

Encoding the path into the label text works, and a human can see it. It was the
fallback while we believed `customData` was stripped. We rejected it once we
verified the round trip. It clutters the board, it is lossy, and it cannot
express more than one field.

## Consequences

A node needs a stable logical id in this metadata. This id is distinct from the
Excalidraw element id. It is the join key that makes two independently authored
variants comparable. It is also the anchor that keeps a code binding attached
across a redraw. Retrofitting identity onto boards drawn without it means
hand-matching every node. The id therefore goes in from the start.

Only the binding is canonical. The presentation boundary can therefore later
choose a different target, such as GitHub or an editor URL. That choice does not
change the board schema.
