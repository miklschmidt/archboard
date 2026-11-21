---
status: accepted
---

# A picture's move is one Between, sampled by progress

The owner's advisors decided this on 2026-11-19 (TASK-653.19, the archboard-deepen run). It says
how [ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) is carried out,
not what it decides: a move is still a pure function of two scenes and a progress value.

## Context

Picture motion had 22 names. A carry and an entrance were two types of the same shape, a plan
and the body it lands on, and the stage's flight matched on the two kinds in ten places to ask
each the same questions. The ghost of the last picture asked the entrance which subjects flew
over, and the departure answered its opacity separately.

## Decision

- **One `Between`, made by `carry` or `enter`.** Picture motion is `Between`, `carry`, `enter`,
  `length`, `at`, `definitions`, `seen_at`, `focus`, `holder_at`, `rebase`, `departing` and
  `frame_of`: 12 names. The kind is private; a carry ignores `rebase`, and an entrance moves no
  mask and opens no door.
- **`at(progress)` answers the body and the moving masks together; `definitions()` apart.** The
  move holds nothing between samples. The stage keeps the definitions index and puts the masks
  in before it draws the body.
- **`enter` answers what is left of the last picture.** When subjects fly over, it returns the
  last picture's body without them, and the ghost takes it. The handover names how far the last
  picture has gone, and the move works out how much of it still shows.
- **`focus(progress)` says what the move is about:** an entrance, or the door that opens in a
  carry, with progress capped at 1. An entrance that keeps the last picture's tray answers none.
- **The time stays the stage's.** `Arriving` holds a `Between`, the carry's definitions and the
  time, and turns a moment into progress. The dive samples its bloom by the camera's path.

## Rejected

- **Two types again, so that a wrong answer cannot be asked.** The two kinds answer the same
  questions from the same plan, and splitting them puts the ten matches back in the caller. The
  three answers one kind does not give are held by seam tests.
- **The time inside the move.** A move that took moments would read the stage's clock and need a
  second way in for the dive, which is sampled by the camera's path, not by time.
- **`frame(&mut self, progress)` with the definitions index kept inside the move.** It would keep
  state between samples, against ADR 0071, and pull the canvas's definitions into Picture motion.
- **A per-frame sample with public fields.** Fields read as getters are width the measure does
  not count, not a narrower interface.

## Consequences

The stage asks one value its questions, and `flight.rs` keeps no match over kinds. `phase` lives
with the curves in `timing.rs`, and `Heading` beside the passage's `Side`, so the passage and
Picture motion no longer import each other.
