# The council's criteria

The four graders of the grading council (Opus, gpt-6.1-sol, gpt-6-astra and Gemini 4 Argon) agreed on this list on 2026-10-27 (TASK-548.12). Each grader first wrote its own criteria from the same twelve sample pictures. Those four lists are in this directory's history at commit e62d75d4e. Each grader then proposed one shared list, and three rounds of votes settled it with every item accepted by all four. The owner's weighting in [grading-council.md](../grading-council.md) comes first: defects are defects, and among pictures without defects, tight composition counts most. On 2026-10-28 Muse Wonder replaced Gemini 4 Argon on the council. On 2026-10-29 the owner removed Muse Wonder, and the council now has three graders who grade with this list as agreed.

## How to look

1. Fit each whole picture into the same 1920×1080 rectangle and look at both. Then enlarge both to the same card-name size for tracing. Do not assume that hover or selection repairs a still picture.
2. Before scoring, pick the same things in both pictures: the two cards with the most incident lines (alphabetical name breaks a tie), one entry part, and one connected two-step path. A line between two cards counts once, whatever its label count.
3. Score each criterion with an integer from 1 to 10 for both pictures. Interpolate between the anchors. Give both pictures the same score on a criterion unless you can name the difference and where it is. For every score below 7, name one location. Round a formula result down to an integer.
4. A card height or card width means that of a typical card on the board. A label height means one label box, not a stack. Use the drawing's bounds for thirds and spans. Ignore the key.
5. Look at every line and every frame for defects, not only the sampled cards.

## Criteria

Composition (K and R) carries 55 of the 100 weight points.

### K. Compact frames and space — weight 30

Question: do frames hold their members closely, and does the picture have no empty bays or bands?

Space that words need (label stacks, descriptions) counts as filled. Lines do not fill space: a region that only lines cross is empty. A pocket is an empty rectangle at least one card wide and four card areas large, outside frames or inside a frame beyond its header and padding. Judge inside the picture's bounds, not its outer margin. A board without frames is judged on its pockets alone.

- 1: A frame spans most of the board with its members at opposite ends, or broad empty bands split the picture into islands. The largest empty rectangle inside a frame is 6 card heights or more.
- 4: A frame is mostly empty around its members (an empty rectangle of about 4 card heights), or three or more pockets.
- 7: Frames have modest padding. One pocket or one loose frame remains (an empty rectangle of about 2 card heights).
- 10: Every frame hugs its members (no empty rectangle over half a card height beyond header and padding). No pocket.

### R. Short, direct relationships — weight 25

Question: do cards that talk sit near each other, with lines that go straight between them?

A costly line runs along half or more of the board's perimeter, along a frame's full height or width, doubles back by a card width or more, or crosses unrelated regions over more than half the picture's span. A bend alone costs nothing.

- 1: Most lines are costly, and direct collaborators sit in opposite regions.
- 4: Two to four costly lines, or several collaborators separated by unrelated content.
- 7: At most one costly line. Most collaborators are adjacent or one card apart.
- 10: Every collaborator is adjacent or one short step away. No line is costly.

### T. Traceable lines — weight 18

Question: can you follow every line of the two busiest cards from source to target, with its direction, on the first try?

Count stop points, each place once: a shared stretch carrying three or more lines. Three or more parallel lines closer than a label height for longer than a card width. Three or more lines meeting one side of a card within a label height. A crossing at a bend or junction where the way each line goes is not seen at once. Score = 10 − stop points, minimum 1.

- 1: Nine or more stop points. Most lines need tracing from both ends.
- 4: Six stop points. About half the lines need a second trace.
- 7: Three stop points. One or two lines need a second look.
- 10: No stop point. Every line follows in one pass.

An ambiguity that remains after close inspection is a defect, not a low T.

### L. Owned labels — weight 10

Question: can you name the line of every label stack at first look?

A crowded stack touches, or sits closer than a quarter of a label height to, another stack or a line that is not its own. Count each stack once. Score = 10 − crowded stacks, minimum 1.

- 1: Nine or more crowded stacks.
- 4: Six.
- 7: Three.
- 10: None. Every stack sits beside its own line with clear space.

### O. Reading order — weight 10

Question: does the picture read from callers at the top to foundations at the bottom?

An entry is a card with no incoming line, and a foundation is a card with no outgoing line. An entry is misplaced when its top edge is more than half a card height below the top third. A foundation is misplaced when its bottom edge is more than half a card height above the bottom third. An upward arrow ends above the card it starts from. A return or an event drawn upward costs half as much as any other upward arrow. Score = 10 − misplaced cards − upward arrows ÷ 2, minimum 1.

- 1: Foundations at the top and entries near the bottom, or most arrows point up.
- 4: Two misplaced cards and about eight upward arrows, for example a store above its callers.
- 7: One misplaced card and about four upward arrows.
- 10: Everything in place, at most one upward arrow.

### W. Readable at pane fit — weight 7

Question: fitted whole into 1920×1080, can you read names and short labels while their cards stay in view?

Score what you can read. The aspect ratio is no band of its own: a narrow or wide picture costs here only through the text it shrinks.

- 1: Most names need enlargement, and reading a label loses its endpoints.
- 4: Names are discernible fitted, but most labels need enlargement that hides an endpoint.
- 7: Names and short labels read fitted. Long text needs enlargement with both endpoints still in view.
- 10: Names and labels read fitted, descriptions need little enlargement.

## Defects

Defects are recorded apart from the scores and never scored. Record each instance with its type, the subjects it touches and where it is. Scores of a picture with a defect still describe its other qualities.

1. A line is missing, or ends away from its card.
2. A line or arrow passes through a card it does not connect to.
3. A line passes through a group's or a parent's header, the header card included, even without covering its letters. Crossing a bare frame edge away from the header is allowed.
4. A label sits off its route, on the wrong line, or equally near two lines.
5. A parent has no visible frame.
6. A trunk joins different sources toward different targets. A fan-in to one target or a fan-out from one source is allowed.
7. Text is covered, clipped or overlapped so that a name or an essential label cannot be read at enlargement.
8. A member card is outside its frame, a frame encloses a non-member, or overlapping frames leave membership unclear.
9. An arrowhead is missing or hidden, so the direction cannot be seen.

Missing content needs visible evidence, such as the content in the companion picture.

## Decisions

One grader:

1. Pixel-identical pictures are `same` without scoring.
2. If exactly one picture has a defect, the other is better.
3. If both have a defect, the verdict is `same` with `both_fail`.
4. Else Q = (30K + 25R + 18T + 10L + 10O + 7W) ÷ 100 for each picture, and Δ = Q(A) − Q(B). Δ ≥ 0.40 is `A better`, Δ ≤ −0.40 is `B better`, anything between is `same`.

The council:

1. Every defect any grader reports is looked at full size by the person running the council. A defect found real counts for every grader. A defect found false is dropped.
2. The defect rules of one grader then apply to the real defects.
3. For two pictures without a real defect, take the median of the three Δ values. Apply the same ±0.40 thresholds.
4. The change fails when any pair is `worse`, or when an after picture has a real defect that its before picture lacks.
