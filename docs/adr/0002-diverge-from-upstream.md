# Diverge from upstream; do not stay mergeable

Archboard is a private internal tool that will never be published and will never
send patches upstream, so keeping changes upstreamable buys nothing and costs
real design freedom — upstream's conventions (npm publishing, Docker images, a
single global canvas) directly conflict with where we are going. We restructure
freely and keep the `upstream` remote only for reference and cherry-picking.

Early commits and docs in this repo did optimise for upstreamability. Anything
that looks conservative for no apparent reason probably dates from then and can
go.

## Consequences

`git merge upstream/main` is not a supported operation — it would drag back
conventions we have deliberately replaced. Taking an upstream fix means reading
it and reimplementing it our way, or cherry-picking a specific commit when it
clearly applies. See the `archboard-dev` skill for the procedure.
