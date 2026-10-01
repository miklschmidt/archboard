---
status: superseded
---

# Diverge from upstream; do not stay mergeable

Archboard is not published to npm and will never send patches upstream. So
keeping changes upstreamable buys nothing and costs real design freedom.
Upstream's conventions (npm publishing, Docker images, a single global canvas)
directly conflict with where we are going. We restructure freely and keep the
`upstream` remote only for reference and cherry-picking.

Early commits and docs in this repo did optimise for upstreamability. Anything
that looks conservative for no apparent reason probably dates from then and can
go.

## Consequences

`git merge upstream/main` is not a supported operation. It drags back
conventions that we deliberately replaced. To take an upstream fix, read it and
reimplement it our way. When a specific commit clearly applies, cherry-pick it.
See the `archboard-dev` skill for the procedure.

Superseded (TASK-310, 2026-09-23): nothing of the forked project is left to
take fixes from, so there is no procedure for it.

Corrected (2026-10-01): this decision first called Archboard a private internal
tool, never to be published. The repository is now public on GitHub under MIT.
It is still not on npm and sends no patches upstream, so the reasoning above
stands.
