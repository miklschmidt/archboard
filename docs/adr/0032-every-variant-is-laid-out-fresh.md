---
status: accepted
---

# Every variant is laid out fresh

The migrated architecture proposals showed what it costs to keep the geometry of
a predecessor. They had empty containers, reserved columns, skipped rows and
long edge detours. On 2026-09-19 the user chose compact, readable layouts over
frozen positions (TASK-276). Every architecture variant now uses the same fresh
layout pipeline, including its own reading direction and flank rule. Ancestor
drawings, sizes, positions and routes are not layout inputs.

Layout does not change the meaning of a comparison. The variant that a picture
is read against decides the Standing of each subject. Since 2026-09-27 that
variant is the current variant of the board, or the direct predecessor on a
board with none (ADR 0023 as amended). Removed subjects remain visible in the
comparison.

Stable subject identities and the transitions of the viewer carry continuity
between pictures. Cards can move, containers can shrink, and a proposal can read
in a different direction. Large rearrangements can make the brief transition
busier. The readability of the settled picture takes priority.

This record supersedes the predecessor-direction rule of ADR 0028. It also
supersedes the placement continuity decisions in `docs/design/layout-rules.md`
sections 15–16. Section 28 of the same record contains the measured before/after
evidence. The renderer keeps one layout path. It has no second set of proposal
placement rules and no threshold for abandoning them.
