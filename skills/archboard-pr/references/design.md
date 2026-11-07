# Explain a design

A design PR records decisions before implementation.
Read the design document and diff before choosing its proposal.
Keep the proposal draft until implemented architecture qualifies for owner-authorized adoption.
For already accurate implemented architecture, use the parent skill's documentation path.

Through the consumer proposal edit recipe, set `proposal.set.documents` to the design references and their source commits.
Preserve the proposal ID and actual predecessor.
Use this comment for later implementation, with the parent skill's rules for optional fields and external vaults:

```markdown
<!-- archboard-pr design model="<model-id>" state="<proposal-id>" checkpoint="<exact-checkpoint>" -->
```

In Summary, state the problem, chosen design, and first intended delivery.
If no implementation exists, say that the PR records a design.
Explain each material decision and reason in domain terms.
Link the design and implementation plan.

Choose scopes that show the boundaries and flows that show order, decisions, and loops.
Use [renders](renders.md) and [walkthroughs](walkthrough.md) for evidence.
Use semantic comparison to explain additions and removals. A picture alone cannot establish comparison standing.

Evidence names supporting research, measurements, source, or an approved plan, without claiming unimplemented behavior.
Merge Danger names decisions that become expensive to reverse during implementation.
A document-only merge remains reversible unless it causes an external effect.
For delivery boundaries, follow the parent skill and [splitting](split.md).
