# The grading council

A layout change that alters drawings is judged by a council of four graders
(Opus, gpt-6.1-sol, gpt-6-astra and Muse Wonder), not by byte-identical
drawings (TASK-548, TASK-548.09, TASK-548.12). Each grader scores both
drawings of a pair on the council's agreed criteria without knowing which
drawing is the change, and the scores decide which reads better to a person.

## Making the pairs

Run this inside `nix develop` from the repository root. Each checkout must have
its own dependencies installed and its own built core (`bun run build:core`).
The before side is usually a detached worktree of the parent commit.

```sh
bun scripts/council-pairs.ts <before-checkout> <after-checkout> <out> \
  [--vault .archboard/vault] [--variants current|all] [--engines track,blocks] \
  [--limit N [--sample]] [--seed 1] [--max-side 4096]
```

- Each checkout draws its own side with its own `scripts/render-corpus.ts`:
  the current variants, the light theme, with and without comparison. A
  theme does not change a layout, so only light is drawn. A comparison
  drawing is kept only where it is a different picture from its plain one.
- The drawings of `--vault` whose bytes differ become pairs. A drawing that
  only one side has, for example after a variant rename, is listed in
  `key.json` and is not paired.
- `--limit N` keeps the first N pairs. Add `--sample` to pick the N at random.
  A large change can differ in hundreds of drawings, so grade a sample first.
  `--seed` repeats the same sample and the same sides.
- One rasterizer turns both SVGs of a pair into PNGs at the same scale: native
  size, shrunk only when the longest side is over `--max-side`.

What it writes:

```text
<out>/pairs/NNN/A.png, B.png   the two sides, before at A or B by the seed
<out>/pairs/NNN/about.json     board, view and engine, nothing more
<out>/key.json                 which side of each pair is before, and its full key
<out>/runs/{before,after}/     each side's corpus run with its SVGs
```

Give the graders a copy of `<out>/pairs` in a directory of its own, such as
`cp -r <out>/pairs /tmp/grading-<run>/`, never `<out>` itself: `key.json` and
`runs/` show which side is which.

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

1. **Graders.** Run Opus, gpt-6.1-sol and gpt-6-astra at `xhigh` effort and
   Muse Wonder (`muse-wonder-1.0`) through Cursor at `xhigh`. Muse Wonder
   replaced Gemini 4 Argon on 2026-10-28. In round 4 none of Argon's 22
   reported defects was real and its margins spread widest. In round 5 its
   weighted scores averaged 8.0 against about 6.0 for the other three. Each grader
   gets the grading copy, the criteria file and the owner's weighting above,
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
   full-size SVG under `<out>/runs/`. Record whether each side of the pair has a
   real defect in `/tmp/grading-<run>/rulings.json`, for example
   `{ "001": { "A": false, "B": true } }`. A defect found real counts for
   every grader, and a defect found false is dropped.
4. **Tally.** Run

   ```sh
   bun scripts/council-tally.ts <out> /tmp/grading-<run>
   ```

   It requires four grader files and all four scores for every selected pair.
   It refuses while a reported defect has no ruling. For each pair it prints
   the verdict for the change (`better`, `worse`, `same` or `both fail`) and
   each grader's margin of the after picture over the before picture. The
   median margin decides, and a margin under 0.40 is `same`. The last line
   says whether the change passes, and the command exits 1 when it fails.
   Record the output and the graders' notes in the task notes.

5. **Outcome.** A change passes when no pair is `worse` and no after picture
   has a real defect that its before picture lacks.
