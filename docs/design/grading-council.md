# The grading council

A layout change that alters drawings is judged by a council of three graders
(Opus, gpt-6.1-sol and gpt-6-astra), not by byte-identical drawings (TASK-548,
TASK-548.09). Each grader compares the drawings before and after the change
without knowing which is which, and decides which reads better to a person.

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

The owner decided this on 2026-10-27, after the second council run. Every
grader applies it before its own weights:

- Defects are defects. A line through a group's or a parent's header is
  one, as are the defects listed under Grading. No other quality makes up
  for a defect.
- Among pictures without defects, a tightly composed board reads better
  than one with dead space. Short, direct lines, frames tight around their
  members and related cards close together count most. A line sent around
  the picture or along a frame's full height, a frame much larger than its
  members, or related cards split by an empty span read worse.

## Grading

1. **Criteria first.** Before it sees any pair, each grader writes down what
   makes an architecture diagram readable, in its own words. It does not use
   the old scorecard metrics (`drawn-scorecard.ts` and the `drawn-*` checks).
   The council's criteria are in `grading-council/criteria-<grader>.md`
   (Opus, gpt-6.1-sol and gpt-6-astra, written on 2026-10-26). A grader
   rereads its own file before each run, and only its own. It also reads
   the owner's weighting below, which comes before its own weights.
2. **One verdict per pair.** The grader looks at `A.png` and `B.png` (and may
   zoom into either) and records `A better`, `B better` or `same`, with a
   one-line reason that names what it saw. It also records every defect it
   sees in either picture. A defect is a line that is missing or ends away
   from its card, an arrow through a card, a line through a group's or a
   parent's header, a label off its route, a parent with no visible frame,
   or a trunk that joins different sources toward different targets. The verdicts go to a file per
   grader in the grading copy, for example
   `/tmp/grading-<run>/verdicts/<grader>.json`, keyed by pair number.
   A grader does not see the verdicts of the other graders.
3. **Unblinding and the majority.** After all three graders are done, read
   `key.json` and turn each verdict into `better`, `worse` or `same` for the
   change. For each pair, the majority is the verdict that two or three
   graders gave. If all three verdicts are different, the pair is `same`.
   Record the per-pair verdicts, the reasons and the majority in the task
   notes.
4. **Outcome.** A change passes when no pair has a `worse` majority.
5. **Defects decide alone.** A defect in the after picture that is not in the
   before picture fails the change, whatever the vote. Check every defect a
   grader reports against the after picture yourself.
