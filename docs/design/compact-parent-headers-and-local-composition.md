# Compact parent headers and local composition

TASK-548.08 and TASK-548.11 propose this round after the second council verdict.
The parent convenes the council.
Both tasks remain In Progress until that verdict.
[ADR 0062](../adr/0062-parent-headers-use-normal-card-sizing.md) records the proposed header design.
[ADR 0061](../adr/0061-group-regions-are-packed-before-solving.md) records the deterministic layout choices.

## The observed failures

The council rejected four pictures from `71b949d87`.
Code evidence sent Route handlers' lines around the picture.
Startup parts sent the checkout handoff around the right side and across the default URL relationship.
Run checks spread Author run's branches across long parallel bus rows.
Voice coordinator stretched its parent frames and separated the callback collaborators.

A header crossing remains a defect.
The tests still reject both group and parent header crossings.
They also reject detached endpoints, card crossings, detached labels, invisible parent frames, and ambiguous trunks.
No drawing helper lost a check in this round.

## The retained design

A rank is one row of cards in a layout.
A trunk is a shared run of relationship lines.

A parent header uses the same 260 to 340 unit width rules as a normal card.
An unbroken word can extend either card to keep all its glyphs visible.
The parent adds its existing 8 unit frame inset outside that measured card.
The enclosing frame sizes itself around the members independently of the header width.
The layout and painter share this compact header size.

The parent's name uses 15 px instead of 14 px, with the existing medium face.
Its icon uses 20 px instead of 18 px in the existing 24 px chip.
The far view adds 1 px to the name sizes that fit its tile.
The responsibility, neutral header face, and frame style remain unchanged.
The shared painter applies this emphasis in both engines and every theme.

An arrow naming a packed parent reaches the measured header inside that parent's layout.
Projection splits a relationship across its containment boundaries.
The projection routes it through the same boundary ports as a member relationship.
A labelled relationship from a parent uses its header and reserves room for its words in that layout.
An unlabelled external relationship can still leave the visible frame boundary.
An unlabelled entry through the top can use the short clear space above the header.
Other entries use the parent's router, which sees its member cards.
A frame pin no longer substitutes for the visible header.

The layout no longer forces each external caller above an entered header.
It also removes the ancestor margins that reserved lanes around full-width headers.
The compact header leaves clear passage beside itself.
Related cards can share nearby ranks without those extra constraints.

A parent uses local ranks when a path between different member cards leaves the parent and returns through outside cards.
Such a path stretches the parent when all its members share the board's global ranks.
The rule reads containment and relationships before the solve.
It reuses the existing block layout and ports.
Paths through a parent's interface name do not stand for paths through its members.
Other parents remain inline, and no card-count cutoff decides the choice.

## Native feedback during development

The saved requests reproduce the exact four failed pairs.
Their IDs remain 003, 022, 028, and 038.
The baseline requests, pictures, and measurements are under `/tmp/548-08/round-3/baseline-cases` and `/tmp/548-08/round-3/baseline-native`.
Each probe keeps its native drawings and metrics under `compact-N-native` in the same directory.
These probes diagnose geometry and composition.
Their debug-build durations are not performance evidence.
A native run uses the compiled Rust core directly.

| Probe | Decision                                                                                          | Result                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1     | Compact sizing, emphasis, and physical header pins                                                | The four named parent connections in Voice coordinator missed their visible header.                                |
| 2     | Keep compact width during rerouting and keep the routed header in its fitted frame                | All four cases passed the measured hard checks. Voice coordinator still stretched its frames.                      |
| 3     | Remove caller-before-header constraints                                                           | Code evidence's selected routes fell from 5,296 to 3,163 units. Startup's handoff fell from 887 to 702.            |
| 4     | Remove the old header bypass margins                                                              | Voice coordinator narrowed slightly. Its member separation remained.                                               |
| 5     | Pack every parent with the Blocks policy                                                          | Voice callback separation improved, but Code evidence grew and Startup gained card crossings. Dropped.             |
| 6     | Pack every parent among Track's loose cards                                                       | Code evidence grew further. Startup and Voice gained detached ends. Dropped.                                       |
| 7     | Use Graphviz's cluster-local ranking                                                              | Voice height fell to 2,338, but labels detached from their lines.                                                  |
| 8     | Place displaced labels between their ends and separate connected row ties                         | The full-board scan found new card crossings outside the four cases. Cluster-local ranking was dropped.            |
| 9     | Restore global ranking                                                                            | The full Track scan had no endpoint, card, label, frame, header, or trunk defect.                                  |
| 10    | Pack parents that contain another parent                                                          | Callback frames tightened, but Voice grew wider. The rule did not explain the flat Tools frame's stretch. Dropped. |
| 11    | Pack parents whose member paths leave and return                                                  | Voice's related cards moved closer, and both tall acceptance frames tightened.                                     |
| 12    | Pack loose cards separately beside these local frames                                             | Voice grew to 6,487 by 4,255. Dropped.                                                                             |
| 13    | Restore loose-card composition and route named parents through their own headers                  | The four acceptance cases passed all measured hard checks. The full Track scan had no hard defect.                 |
| 14    | Build the first complete core candidate                                                           | The focused header and integrity tests passed. The full renderer run found 16 regressions.                         |
| 15–17 | Separate frame insets from header insets, place headers before routing, and center wider captions | Frame widths and member insets recovered. The discarded row adjustment no longer changed flowcharts.               |
| 18    | Increase every lane from 16 to 20                                                                 | Dense Track spacing failures remained at 13, 22, and 13 on the three affected boards. Dropped.                     |
| 19    | Keep distinct point ports distinct and preserve measured child block widths                       | The full Track scan passed every geometry check. All hard checks passed on the full Blocks scan.                   |
| 20    | Reduce node spacing around boundary ports from 40 to 20                                           | Run checks shortened slightly, but Voice picture area grew 8%. Dropped after visual inspection.                    |

The retained native acceptance geometry from probe 19d is below.
Route length counts every selected relationship separately, including shared strokes.
Manhattan distance adds horizontal and vertical distances.
Extra length is the route length beyond that distance between its ends.
Callback separation adds the Manhattan distances from Tell coordinator to Callback queue and Callback delivery.

| Case                                | Before        | After         |
| ----------------------------------- | ------------- | ------------- |
| Code evidence selected route length | 5,296         | 3,163         |
| Code evidence extra route length    | 1,565         | 0             |
| Startup handoff length              | 887           | 702           |
| Startup handoff extra length        | 38            | 0             |
| Run checks selected route length    | 7,206         | 4,697         |
| Run checks extra route length       | 560           | 148           |
| Voice callback separation           | 4,425.5       | 1,728.5       |
| Tools and work frame height         | 3,100         | 847           |
| Coordinator callbacks frame height  | 2,728         | 967           |
| Voice whole picture                 | 5,498 × 4,813 | 4,974 × 3,918 |

The acceptance pictures were rasterized and inspected during these probes.
The compact headers stay visible and distinct from their members.
Code evidence and Startup keep direct runs beside the headers.
Run checks keeps Author run above its branches, with a shorter return from Captures.
Voice keeps its callback collaborators in one compact frame.
Its outer routes still need the council's judgment.

## Performance reference from the parent

The parent's quiet-box measurements at load 1.4 remain the previous accepted speed evidence.
Board viewer took 442 ms for the first render and 380 ms after a growing edit.
Board persistence took 229 and 224 ms.
Archboard server routes took 150 and 142 ms.
Browser application took 185 and 173 ms.
Live panes took 118 and 115 ms.
The earlier measurements under the orphaned Git owner load remain noise.

## Test ownership

The header test now compares the painted parent card with a regular card containing the same text.
It measures the stronger name and icon in both engines, in light, dark, and inherited themes.
It also checks incoming parent links, member links, and outgoing parent links with the existing drawing integrity owner.
The measurement test reads parent names at their new 15 px size.
The arrowhead regression keeps its full-head requirement for a straight header entry.
When the route turns, it still requires a rounded bend with its own room before the head.

The wrap regression now compares rows within each sibling family.
A local parent layout has its own rows, so an outside card does not belong to the same row sequence as its members.
The wide-caption regression still requires the same card and header widths.
It permits the parent frame to shrink when its new entry face uses less room.
It still requires a centered frame, complete captions, and attached lines.

One assertion about two named crossing strokes belonged to the removed speculative label placement.
That assertion is removed because the council now judges ordinary crossing tradeoffs.
All header, card, label, endpoint, frame, and ambiguous-trunk checks remain.
The feedback example keeps before and after native SVGs under `feedback-tradeoff-before` and `compact-19d-regressions`.
Its callback frame height falls from 1,123 to 762, and picture area falls from 2,490,851 to 2,013,555 square units.
The two named strokes cross in the new picture, which the council must weigh.

The native scan covers all 17 current vault boards and six fixed fixtures in both engines.
The four acceptance pictures add their exact council requests.
It finds no header crossing, card crossing, detached endpoint, detached label, hidden parent frame, or ambiguous trunk.
The Blocks scan records one optional lane-spacing count at 11.5 units in Board rasterizer's fan-in to Video encoder.
The existing hard lane-spacing assertion applies to Track.
The Track scan finds no lane-spacing or wall-spacing count.
