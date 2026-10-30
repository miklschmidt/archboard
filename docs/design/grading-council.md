# The grading council

A layout change that alters drawings is judged by a council of three graders
(Opus, gpt-6.1-sol and gpt-6-astra), not by byte-identical
drawings (TASK-548, TASK-548.09, TASK-548.12). Each grader scores both
drawings of a pair on the council's agreed criteria without knowing which
drawing is the change, and the scores decide which reads better to a person.

## Making the pairs

The council's tools are scratch tooling and live outside this repository.
They draw each side with its own checkout's `scripts/render-corpus.ts`, the
before side usually from a detached worktree of the parent commit, and pair
the drawings whose bytes differ.

- Only the light theme is drawn, because a theme does not change a layout.
- A large change can differ in hundreds of drawings, so grade a sample: the
  drawings known to be at risk, and a seeded random draw of the rest.
- Each pair holds the two sides as `A.png` and `B.png`, in a random order, at
  one shared scale, and an `about.json` with board, view and engine only.
- A key that says which side is before stays outside the graders' copy.

## The owner's weighting

The owner decided this on 2026-10-27, after the second council run. The
council's criteria follow it, and it comes before them:

- Defects are defects. A line through a group's or a parent's header is
  one, as are the other defects in the criteria. No other quality makes up
  for a defect.
- Among pictures without defects, a tightly composed board reads better
  than one with dead space. Short, direct lines, frames tight around their
  members and related cards close together count most. A line sent around
  the picture or along a frame's full height, a frame much larger than its
  members, or related cards split by an empty span read worse.

## Grading

The criteria, their anchors, the defects and the decision rules are in
[grading-council/criteria.md](grading-council/criteria.md). Each grader
rereads that file before each run.

1. **Graders.** Run Opus, gpt-6.1-sol and gpt-6-astra at `xhigh` effort.
   A fourth seat held Gemini 4 Argon and then Muse Wonder, and the owner
   removed both. In round 4 none of Argon's 22 reported defects was real and
   its margins spread widest. In round 5 its weighted scores averaged 8.0
   against about 6.0 for the other three. Muse Wonder replaced it on
   2026-10-28. In the council of TASK-554 none of Muse Wonder's nine reported
   defects was real, and the owner removed it on 2026-10-29. A grader must
   see the pictures itself. Cursor's file reader gives a model a written
   description of a picture instead of the picture. A trial of DeepSeek V4.1
   Flash through Cursor graded from such descriptions and pixel scripts, and
   its margins did not follow the council's (correlation -0.08 with the
   median, against 0.58 to 0.66 for each grader with the other two). Before
   a new grader counts, read its transcript and make sure that it opened the
   pictures. Each grader gets the grading copy, the criteria file and the owner's weighting above,
   and nothing else. It does not use the old scorecard metrics
   (`drawn-scorecard.ts` and the `drawn-*` checks), and it does not see the
   other graders' files.
2. **Scores.** For each pair, the grader looks at `A.png` and `B.png` and
   scores both on every criterion from 1 to 10. It also records every defect
   it sees in either picture. It writes one file, for example
   `/tmp/grading-<run>/verdicts/<grader>.json`, keyed by pair number:

   ```json
   {
   	"001": {
   		"A": { "K": 4, "R": 5, "T": 7, "L": 10, "O": 6, "W": 5 },
   		"B": { "K": 6, "R": 5, "T": 7, "L": 10, "O": 6, "W": 5 },
   		"defects": [
   			{ "side": "B", "type": 3, "where": "a gray line through the Pane state header" }
   		],
   		"note": "B keeps Board lease beside Atomic file replacement"
   	}
   }
   ```

   `type` is the number of the defect in the criteria file. `note` names
   what decided the scores.

3. **Rulings.** Look at every defect a grader reports yourself, in the
   full-size SVG of its side. Record whether each side of the pair has a
   real defect in `/tmp/grading-<run>/rulings.json`, for example
   `{ "001": { "A": false, "B": true } }`. A defect found real counts for
   every grader, and a defect found false is dropped.
4. **Tally.** Once every reported defect has a ruling, unblind the scores.
   For each pair, take each of the three graders' weighted margin of the after
   picture over the before picture. The median margin decides, and a margin
   under 0.40 is `same`. Each pair's verdict for the change is `better`,
   `worse`, `same` or `both fail`. Record the verdicts, the margins and the
   graders' notes in the task notes.

5. **Outcome.** A change passes when no pair is `worse` and no after picture
   has a real defect that its before picture lacks.
