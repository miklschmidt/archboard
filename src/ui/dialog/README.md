# Dialog provenance

- Upstream repository: https://github.com/shadcn-ui/ui
- Immutable commit: `b4a618b97e35f5dadf3a00d51f410c84a2567d4d`
- Upstream path: `apps/v4/registry/bases/base/ui/dialog.tsx`
- Reviewed fixture: `docs/design/vendor/shadcn-base/dialog.tsx`
- Fixture SHA-256: `85f9a33d1a8c495b0faecd066dae1581b8feb5d27f912ecf65f814386f6da3a9`
- Reduced on: 2026-08-31
- Local owner: `src/ui/dialog`
- Runtime primitive: `@base-ui/react` 1.7.0
- Accepted dependency: `src/ui/button` and its recorded provenance

The reviewed fixture is a noncompiled reading copy. The reduced module is Archboard-owned source.
Any update requires a new immutable upstream commit, fixture hash, dependency review, and local
review before the source changes.

The local backdrop uses the semantic background color at 60% opacity through
`bg-background/60`. This stays close to the legacy modal backdrop's 62% opacity while leaving the
canvas visible behind the dialog.
