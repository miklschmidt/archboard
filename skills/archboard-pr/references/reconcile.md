# Align the proposal and implementation

A proposal states intended architecture, and the diff states what the branch implements.
Read both through their exact model state and source revisions.
Use `model compare`, `model footprint`, and `check code --state` for the affected subjects.

Account for these outcomes:

- Implemented as proposed: preserve identities and attach the actual bindings and evidence anchors.
- Proposed but unimplemented: keep that meaning proposed, or record its authorized removal.
- Implemented but undescribed: update the proposal to describe the actual architectural change.

If a difference changes the approved design, use the existing authorization to resolve it.
If that decision exceeds authorization, present the concrete source difference and required decision to the owner.
Keep independent work available while that decision remains pending.
Routine factual corrections need no repeated permission.

## Reconcile inherited changes

Read `selectedState.standing` and each affected descendant before editing.
Claim the state, structure, and affected subjects across the complete family.
Use the consumer `model edit` reconciliation intent to follow a changed predecessor.
Settle reported issues through the explicit settlement intent.
A blocked descendant must wait for its ancestor's settlement.

Preserve the retained baseline that established each conflict.
Keep proposal-side disputed meaning until explicit settlement.
The shared writer installs safe inherited changes and descendant standing together.
Use the returned complete revision for the next operation.
A changed request needs a new operation identity.

## Keep design evidence current

If the design document changes, read its diff from the referenced commit.
Update the affected proposal meaning and document reference through one complete edit.
Keep unrelated proposals and their baselines unchanged.
Use stable state IDs when names are ambiguous.

A larger design can support a narrower implementation intent without losing its remaining planned subjects.
Create a separate dependent proposal only when its actual complete predecessor fits that intent.
Do not trim an inherited design to manufacture a narrower picture.
Use reading scope and focus to narrow evidence instead.

Done: proposal meaning matches the authorized change, document references identify its source, and affected standing is explicit.
