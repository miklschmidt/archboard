# Codex protocol fingerprint corpus

The repository-policy mirror matcher uses a checked-in fingerprint corpus for
the exact Codex 0.151.0 experimental TypeScript tree. Keeping this reference
tracked is intentional: the ignored generated tree is absent in a clean
checkout, and policy scans need a fast local reference without invoking Codex
for every source file. The repository gate regenerates the whole corpus from
the pinned project-local binary and compares the complete JSON bytes, so the
tracked reference cannot silently drift.

Regenerate and write the corpus with:

```bash
bun run generate:codex-protocol-fingerprint-corpus
```

Verify without writing with:

```bash
bun run check:codex-protocol-fingerprint-corpus
```

Both commands run `codex app-server generate-ts --experimental --out
<temporary-directory>`, require the pinned `@openai/codex` 0.151.0 executable,
verify the 820-file generated-tree digest, and compute fingerprints through the
same `astFingerprint` implementation used by the ownership matcher. The
temporary generated tree is removed after either command.
