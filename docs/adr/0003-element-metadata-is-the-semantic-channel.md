# Element metadata carries the semantic model, namespaced under `archboard`

A node's meaning — its kind, its binding to code, which variant it belongs to —
lives in the element's own `customData`, namespaced as `customData.archboard`.
A code binding persists as `customData.archboard.binding`: repository identity,
repo-relative path, and branch/commit/confirmed-at details when available.
Machine-local targets such as `file://` URLs are derived from that binding only
when an element is presented to a browser or caller, and are stripped before the
note is written.

`customData` and human-authored Excalidraw `link` values both survive the full
round-trip including a human dragging the element in the browser, which was
verified before committing to this. That survival is why archboard preserves
unrelated board/web links while keeping binding-derived code links out of the
persisted note.

Namespaced because the Obsidian Excalidraw plugin writes its own top-level
`customData` keys (`latex`, among others) and flat names like `node` or `path`
would eventually collide.

## Considered Options

- **A sidecar mapping file** (element id to metadata) — rejected because element
  ids are not stable across redraws, mermaid conversion, or variant authoring, so
  the sidecar drifts silently and there is no way to detect it.
- **Encoding the path into the label text** — works and is human-visible, and was
  the fallback while we believed `customData` was stripped. Rejected once the
  round-trip was verified: it clutters the board, is lossy, and cannot express
  more than one field.

## Consequences

A node needs a **stable logical id** in this metadata, distinct from the
Excalidraw element id. It is the join key that makes two independently authored
variants comparable, and the anchor that keeps a code binding attached across a
redraw. Retrofitting identity onto boards drawn without it means hand-matching
every node, so it goes in from the start.

Because only the binding is canonical, the presentation boundary can later
choose a different target, such as GitHub or an editor URL, without changing the
board schema.
