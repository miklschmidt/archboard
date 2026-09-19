---
status: accepted
---

# Every variant is laid out fresh

The migrated architecture proposals exposed the cost of preserving predecessor
geometry: empty containers, reserved columns, skipped rows and long edge detours.
On 2026-09-19 the user chose compact, readable layouts over frozen positions
(TASK-276). Every architecture variant now uses the same fresh layout pipeline,
including its own reading direction and flank rule. Ancestor drawings, sizes,
positions and routes are not layout inputs.

Comparison meaning is unchanged: the direct predecessor determines each
subject's Standing, and removed subjects remain visible in the comparison.
Stable subject identities and the viewer's transitions carry continuity between
pictures. Cards may move, containers may shrink, and a proposal may read in a
different direction. Large rearrangements can make the brief transition busier;
readability of the settled picture takes priority.

This supersedes ADR 0028's predecessor-direction rule and the placement
continuity decisions recorded in `docs/design/layout-rules.md` sections 15–16.
The same record's section 28 contains the measured before/after evidence. The
renderer keeps one layout path rather than a second set of proposal placement
rules or a threshold deciding when to abandon them.
