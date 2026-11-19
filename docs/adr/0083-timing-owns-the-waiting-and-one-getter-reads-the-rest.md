---
status: accepted
---

# Timing owns the waiting, and one getter reads the rest

Decided for TASK-653.02, candidate 1 of the archboard-deepen run, with owner decision 18
(2026-11-19). It applies [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md)
and [ADR 0082](0082-the-code-check-judges-module-depth-from-the-code.md) to `@archboard/timing`.
[ADR 0042](0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md) and
[ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) still keep every
duration in this package.

## Context

`timing` exported 37 functions: 26 getters that each returned one key of one owner's group, and
11 computations, most of them `now + duration` for one key. The code check found it wide and
shallow. Callers did the timing themselves: 15 hand-written poll loops, about 24 deadline and age
sums, refusal sentences that divided a bound by 1000. Each loop chose on purpose whether it slept
first, where it checked its bound, whether the bound's own moment counted, and how its last sleep
met the bound, and none of that could be tested without its caller.

## Decision

- **Waits are operations of timing.** `waitUntil(wait, probe, options)` polls on a named wait
  that keeps its bound, its cadence, whether it sleeps first, where it checks the bound, whether
  it refuses at or only past the bound, and how its last sleep meets it. A caller may give its own
  bound, an outer cap, a signal and a clock. The answer is the value found or a refusal with its
  reason and the bound in seconds, which the caller puts in its own sentence. `pause(cadence,
  options)` sleeps one named cadence for a loop that keeps its own decisions across passes.
- **Deadlines are named.** `deadline(name, fromMs, capAtMs?)` ends a named duration and never
  passes a cap. An age check compares the time now with a deadline, and the caller keeps its own
  operator, because whether the moment itself counts differs between callers.
- **One keyed getter reads the rest.** `durationMs(name)` reads a duration as a number. Under
  owner decision 18 a keyed getter over a closed, typed set of names counts as one name, at most
  one per package. Its names are exactly the durations that something other than a wait or a
  deadline takes as a number: a stylesheet, a physics constant, a timer, a library's option or the
  words of a message. A wait's bound or cadence is not among them, because the wait reads it.
- **One exception: the model lock's poll.** `"modelLock.poll"` is a wait's cadence and stays
  readable, because the registry lock sleeps it with `Bun.sleepSync`, a synchronous sleep that this
  browser-safe package cannot make, and one synchronous caller does not earn a name.
- **A timer's duration is readable even when it also bounds a wait.** `"git.groupCleanup"` bounds
  the wait for a terminated Git group to go away and is also the grace timer that a terminated Git
  command races against. Timers keep their own schedulers (below), so that timer reads it.
- **One clock port.** `Clock { now; after(ms, run) -> cancel }` is the seam. The default reads
  `Date.now` and `setTimeout` when called, so a process that replaces them is obeyed; it stays
  private. A caller that waits on a monotonic clock, such as a walkthrough page, passes its own.
  The workhorse stop and the Codex process-group cleanup take this port; the frame clock and the
  pane deadline clock keep their own shapes.
- **The owner groups stay inside**, each key with what it pulls against, named `"<owner>.<key>"`.

## Considered and rejected

- **A timer operation** (`after(name, run)` that schedules and returns a cancel). It is
  `setTimeout` plus a lookup, so it fails the deletion test, and inside timing it would let files
  under the frame-clock lint rule schedule real timers unseen. Timer owners keep their schedulers
  and read `durationMs`.
- **An age operation** (`isExpired(name, startedMs, nowMs)`). Callers differ in whether the moment
  itself counts (`>` for the registry lease, `<=` for voice start, `<` for the quiet beat), so one
  operator would change some of them. `deadline` holds the sum, the caller the comparison.
- **A retry operation** that generalises `codexRestartDelayMs`. One backoff caller is no real
  need.
- **A getter per owner**, as before. Under owner decision 18 a getter narrows nothing, and the
  callers kept the waiting.

## Consequences

- Each wait's private policy is tested at the seam on a fake clock: sleep-first, caller bound,
  outer cap, signal before a look, the bound's own moment, overshoot, cancellation winning over a
  passed bound, and probe errors.
- Caller tests that advanced fake time by a getter use literals.
- A new wait adds a policy, not a loop; a new readable name needs a numeric consumer that is not a
  wait.
