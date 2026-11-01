# Explain a design

A design PR records decisions before implementation.
Its canonical proposal describes the intended modules, relationships, flows, and walkthroughs.
The proposal remains draft until the owner explicitly adopts implemented architecture.

Read the design document and the diff before selecting its proposal.
If the architecture already describes the delivered change accurately, documentation needs no additional proposal.
Use source-contract evidence for that case.

Record design document references on the proposal through `proposal.set.documents` in `model edit`.
Pin each reference to the source commit that the proposal describes.
Preserve the proposal's stable identity and actual predecessor.
Use the normal claims and complete expected revision.

## Present the decisions

Keep Summary, Evidence, and Merge Danger as the three body sections.
Lead with the problem, chosen design, and first intended delivery.
State that the change records a design when it contains no implementation.
Explain each material decision and its reason in the design's own terms.
Link the design document and implementation plan.

Choose canonical scopes that show the relevant boundaries.
Use explicit flows for order, decisions, and loops.
Follow [renders](renders.md) and [walkthroughs](walkthrough.md) for retained evidence.
Use semantic comparison results to explain additions and removals.
An exported picture alone does not establish comparison standing.

The state comment can identify the design for later implementation:

```markdown
<!-- archboard-pr design model="<model-id>" state="<proposal-id>" checkpoint="<exact-checkpoint>" -->
```

Omit a checkpoint until an exact retained reading exists.
Add the portable vault repository identity when another repository owns the model.
Matching design names never authorize merging independent proposals.

Evidence names the research, measurements, source, or approved plan that supports the design.
It does not claim implemented behavior before code exists.
Merge Danger names decisions that later implementation makes expensive to reverse.
A document-only merge remains reversible unless it triggers an actual external effect.

If one integration PR builds the design, keep its proposal and evidence within that PR.
If the user permits independently useful layers, follow [splitting](split.md).
Proposal ancestry and source branch ancestry remain distinct.
