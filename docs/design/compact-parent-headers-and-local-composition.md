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

## Retained milestone

Commit `9a6d1c147` implements this round.
It builds core `bcef85a5dd93aa25`.
The affected Rust crates pass their tests and Clippy.
The matching-core renderer suite passes 653 tests, skips one platform-only test, and fails none.
The complete `bun run check` gate passes all 20 tasks and all 19 browser files.
Its log is `/tmp/548-08/round-3/retained-full-check.log`.
The proposal code check retains the same 41 finding identities, with no new finding.
Those findings predate this round.
The manual source reading also covers the layout and painter descriptions that the code check cannot assess.
The proposals remain unadopted until the council decides.
The consumer skill needs no change because its commands and authoring contract remain the same.

The final simplification removes the old caller-entry constraints and ancestor header bypass margins.
It also removes unused experimental frame fields and the unrelated flow-row adjustment from the rejected ranking probe.
The retained implementation uses the existing block layout and Solver port.
It adds no old/new switch or board-name exception.

## Fresh performance evidence

The original parent remains at `5f36973df`, with core `ce42bd12e4ee9ccb`.
Its Rust and build inputs match `f06fa5317`, which supplied the saved original native binary.
The previous candidate uses the saved `after-7-critical-path` binary.
The new binary is `/tmp/548-08/round-3/retained-critical-path`.
All three read the same captured requests in `/tmp/548-08/post-553/requests`.
No build, test, corpus render, or owned server runs beside these measurements.
The process audit finds no Git owner before measurement.

The instruction counter draws each of the three target boards once.
Each run uses `perf stat -e instructions:u` with `taskset -c 2` inside `nix develop` and `nix shell nixpkgs#perf`.
The pin keeps the count on one performance core.
Unpinned counters on this hybrid CPU report separately scaled core and atom values, so those counts are excluded.

| Source             | User instructions, three boards |
| ------------------ | ------------------------------: |
| Original parent    |                 152,743,987,463 |
| Previous candidate |                   9,663,930,648 |
| This round         |                   9,206,551,892 |

This round uses 94.0% fewer instructions than the original and 4.7% fewer than the previous candidate.
The counter logs end in `-pinned-instructions.txt` under `/tmp/548-08/round-3`.

The native timing uses the shortest critical path from three renders per board.
The critical path is the longest dependent chain of layout solves.
The following times exclude measurement, painting, and other work beside those solves.
The one-minute load is 1.82 for the original, 1.17 for the previous candidate, and 1.31 for this round.

| Board                   | Original solves / ms | Previous candidate solves / ms | This round solves / ms |
| ----------------------- | -------------------: | -----------------------------: | ---------------------: |
| Board viewer            |            24 / 1053 |                        1 / 215 |                 1 / 80 |
| Board persistence       |            25 / 1089 |                        1 / 100 |                 1 / 83 |
| Archboard server routes |             27 / 325 |                         1 / 73 |                 1 / 72 |

The sum of those paths falls from 2,467 to 235 ms.
The previous candidate totals 388 ms.
Work beside the solves takes 64, 150, and 29 ms this round, in the table's board order.
The previous candidate takes 69, 71, and 32 ms beside its solves.
Board persistence therefore spends more time outside layout, despite its shorter solve.
That cost remains visible in the pool's cached rendering time.

The pool runs alternate parent, candidate, parent, candidate with `timing.ts 7`.
The recorded one-minute load ranges from 1.81 to 3.51.
Each cell below gives both first-render measurements, with the cached medians in parentheses.
The full logs include every current vault board and the fixed wide fixtures.

| Board                   | Original first, cached ms | This round first, cached ms |
| ----------------------- | ------------------------- | --------------------------- |
| Board viewer            | 1422, 1517 (39, 42)       | 200, 202 (48, 48)           |
| Board persistence       | 1486, 1546 (36, 36)       | 295, 299 (72, 72)           |
| Archboard server routes | 665, 626 (28, 28)         | 148, 151 (30, 29)           |

Board persistence is the slowest first render in both candidate runs, at 295 and 299 ms.
Every current vault board and fixed fixture stays below 500 ms in those runs.

The growing-edit harness runs in three fresh processes per checkout, with a one-card core warm-up.
It appends two responsibility lines to the first leaf and requires a real height change.
Parent and candidate runs alternate.
Each result below is the median of three measurements from that harness.
The recorded one-minute load ranges from 2.97 to 3.39.
The harness records each checkout's source hash and renderer path, so the parent cannot use the candidate's modules.

| Board                   | Original first / growth ms | This round first / growth ms |
| ----------------------- | -------------------------: | ---------------------------: |
| Board viewer            |                1560 / 1447 |                    280 / 203 |
| Board persistence       |                1473 / 1472 |                    299 / 289 |
| Archboard server routes |                  588 / 581 |                    140 / 134 |

All measured candidate first renders and growing edits stay below 500 ms.
The earlier quiet parent measurements remain the previous candidate's reference, rather than a matched run in this alternation.
In particular, Board persistence's earlier 229/224 ms is faster than this round's 299/289 ms.
The new round improves Board viewer and retains the owner's threshold on all three targets.
Raw results, load records, and source hashes are in `pool-and-growth-runs.json` and `pool-and-growth-summary.json` under `/tmp/548-08/round-3`.
The scratch `measure-growth.ts` and `measure-pool.py` files preserve the measurement procedure.

## Corpus and council delivery

The before corpus is `/tmp/548-08/round-3/base`, from the previous candidate after merge `3f573f10a`.
The after corpus is `/tmp/548-08/round-3/after-1`, from implementation `9a6d1c147`.
Both keep every SVG beside `corpus.json`.
Each contains 2,452 drawings from 2,508 jobs.
Each includes 76 whole-board drawings: both engines and themes for all 17 vault boards and both example boards.
The corpus comparison changes 1,204 drawings across 19 boards, including 72 whole-board drawings.
Its elapsed render times overlap other validation work and are not speed evidence.

| Board                   | Changed drawings |
| ----------------------- | ---------------: |
| Archboard               |               28 |
| Archboard server        |               80 |
| Archboard server routes |               68 |
| Board persistence       |               48 |
| Board rasterizer        |               76 |
| Board viewer            |              124 |
| Browser application     |               52 |
| Codex realtime voice    |              140 |
| Codex session           |               24 |
| Codex workhorse         |              100 |
| Command dispatch        |               44 |
| Command interface       |               76 |
| Inventory service       |               36 |
| Live panes              |               48 |
| Renderer layout         |               60 |
| Semantic renderer       |               68 |
| Skill evaluation        |               60 |
| Voice coordinator       |               68 |
| Web shop                |                4 |

`/tmp/548-08/round-3/changed-svg-pairs.json` names both SVGs for every changed drawing.
`whole-board-svg-pairs.json` names all 76 whole-board pairs, including unchanged pictures.
`acceptance-svg/manifest.json` names the four failed council pairs and the extra feedback tradeoff.
Their after pictures come from the matching Bun core and match the retained native geometry.
The four failed pairs contain no measured hard defect.
The extra feedback example records the ordinary crossing described above.
All earlier probe and render directories remain available.

The final visual inspection also covers dark Browser application and Board viewer whole boards in both engines.
The PNGs remain under `/tmp/548-08/round-3/inspection`.
Board viewer's area falls 28.7% in Track and 14.1% in Blocks.
Browser application's area falls 22.6% in Track but grows 93.2% in Blocks.
That Blocks picture spreads the top-level families more widely, despite tighter compact headers inside each family.
It is a fresh council tradeoff, not evidence that every composition improves.
Voice coordinator's Track area falls 26.4%, but some outer routes remain long.
No hard defect appears in the inspected pictures or the measured whole-board scan.

The parent must grade the four failed pairs and a fresh sample before acceptance.
Browser application in Blocks and the extra feedback pair are explicit candidates for that sample.
If the council accepts the design, the next performance lever is Board persistence's work beside its single solve.
If the council rejects a composition, its graph-level placement needs revision before adoption.
TASK-548.08 and TASK-548.11 remain In Progress.

The final delivery audit finds no Git owner process, and the owned server is stopped.
No branch is pushed.
