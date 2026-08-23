---
id: TASK-099
title: >-
  A human's edit can be lost between the pane's scene and its baseline, and the
  server never hears it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-22 22:26'
updated_date: '2026-08-23 00:10'
labels: []
dependencies:
  - TASK-098
references:
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/changes.ts
  - scripts/check-live-session.mjs
priority: medium
type: bug
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating an intermittent `check-live-session` reported against TASK-091. It is not a flaky check: the check is correctly reporting that a person's edit was silently dropped.

## The signature

```
first diverged on cycle 33 (agent recolour, human resize):
  auth (rectangle) .width: server 232 / pane 238
```

The pane holds the human's resize and the server does not, and it never catches up — `agree()` re-reads both sides for six seconds before giving up. The edit is not in flight, it is gone. On the wall that is a person's drag disappearing into the vault with nothing said.

Three kinds of human edit have been seen lost, all permanent, all pane-ahead:

```
cycle 33 (agent recolour, human resize)
  auth (rectangle) .width: server 232 / pane 238

cycle 14 (agent relabel, human retype)
  BDgCjPv2 .text:         server 'store v14'  / pane 'typed at 14'
  BDgCjPv2 .rawText:      server 'typed at 2' / pane 'typed at 14'
  BDgCjPv2 .originalText: server 'store v14'  / pane 'typed at 14'

cycle 31 (agent create-arrow, human delete)
  svc30 (rectangle): the server holds it, the pane does not
  queue (rectangle) .boundElements: the server carries one arrow more than the pane
```

The retype is the worst of the three, because the element ends up incoherent rather than merely behind: the server's copy carries `text` from the agent's relabel and `rawText` from a human retype twelve cycles earlier. Three values, none of them the current document.

## Candidate mechanism, read rather than proved

`applyServerScene` (`frontend/src/canvas/useCanvasSession.ts`) replaces the scene and then rebaselines inside `settle()`, which is a `setTimeout(..., 0)` with change detection suppressed until it fires. It rebaselines from `api.getSceneElements()` — the pane's live scene — rather than from the elements the server sent.

An edit applied in that window is therefore folded into the baseline without ever being reported. The check's `humanEdit` calls `app.updateScene` directly, so it lands in that window whenever an agent's broadcast is in flight, which the 42-cycle loop arranges on purpose. A person drawing on a wall while an agent writes is the same arrangement.

Unverified: nobody has instrumented the window and caught it. It matches every observed symptom and no other mechanism found does.

## Rates

Every run standalone, one at a time, nothing else on the machine.

**Interleaved, which is the comparison worth trusting** — the two trees alternating rather than each in a block, because two blocks are minutes apart on a shared machine and this check is sensitive enough to notice:

| Tree | Failures |
|---|---|
| `ca8f399`, before TASK-091 | 1 of 10 |
| `ca8f399` + TASK-091 + its follow-ups | 1 of 10 |

Both arms failed on the same round, which says the machine rather than the tree.

**In blocks, which is how the earlier numbers were taken and why they disagree:**

| Tree | Failures |
|---|---|
| `ca8f399` | 1 of 10 |
| `6db912d` (TASK-098 + TASK-091) | 0 of 10 |
| TASK-091 without TASK-098 | 0 of 10 |
| `ca8f399` + TASK-091 + follow-ups | 2 of 4 |

That last row is the highest rate measured and the measurement was abandoned at four runs — not because it looked bad, but because a block of runs against one tree cannot be compared with a block against another taken twenty minutes earlier. The interleaved table replaced it and put the same tree at 1 of 10.

A chain run rather than a standalone one will also print an ADR 0006 conflict below the divergence, with `versionMove: unchanged`. That is check-live-session's own held-board section rewriting the note on purpose to test the hold. It is not a second symptom.

## Its relationship to TASK-097

TASK-097 reads this family as contention, and that is not the whole of it. This reproduces standalone at about one run in ten; the wait it blames is already a condition with a six-second budget, not a fixed window, and it runs that budget out. Contention makes it likelier. Something else makes it possible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The window between a server scene landing and the pane rebaselining cannot swallow a local edit: an edit applied in it is still owed to the server and still reported
- [ ] #2 The mechanism is established by instrumentation or a deterministic reproduction before anything is changed
- [ ] #3 check-live-session passes 20 standalone runs at the rate this task was filed against
- [ ] #4 A text element cannot end up holding text, rawText and originalText from three different writes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Instrument the window before changing anything. A delivery canary in the pane (frontend/src/canvas/delivery-canary.ts), off unless the page has been given window.__abDelivery, armed synchronously after every updateScene and read at the settle that writes the baseline down. It names the element, the field and both values, and says whether the baseline was about to cover it.
2. Add a debt watchdog beside it: at every point where the pane decides it has nothing more to say — the settle timeout, the debounce firing under suppression, sendReport returning because one is in flight, and sendReport finishing — ask whether the pane still owes the server anything with nothing armed and nothing in flight. That classifies a loss into absorbed-into-the-baseline against owed-but-unarmed.
3. Reproduce deterministically rather than sampling. The check owns the page, so wrap window.setTimeout: a 0 ms timeout scheduled while an edit is pending runs the edit first, which puts a human's hand exactly inside [updateScene, settle]. Assert the whole loss: the canary names it, the server never hears it, the pane keeps it.
4. Fix. The baseline is taken from the delivery at the moment of delivery, synchronously after updateScene, so there is no window to fold anything into; and when suppression lifts the pane asks whether anything moved while it was not listening, so an edit made in the window is still armed. TASK-098's withholding semantics move in time and not in meaning.
5. Revert-proof each half against the deterministic reproduction and count.
6. Twenty standalone runs of check-live-session, and ten a side interleaved against the tree before the fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
MECHANISM, ESTABLISHED BEFORE ANYTHING WAS CHANGED, AND THE CANDIDATE WAS RIGHT — but it is two routes, not one, and only the first was in the report.

Sampling did not find it: a loss canary in the pane, armed synchronously after every updateScene and read at the settle that writes the baseline, watched 810 deliveries across 10 standalone runs and saw nothing enter the window. All 10 passed, so the bug did not visit; that says nothing about the window.

So it was arranged instead. Scene.replaceAllElements is where a delivery lands whoever called it — and patching it there rather than updateScene is what makes it work, because the imperative API the pane holds captured this.updateScene when it was made. Armed, the next delivery schedules the human's edit in a microtask, which runs after the pane's delivery code and before the timeout that writes the baseline. Every time.

On the unfixed tree, with the check's own store/queue board:

  agent recolours the box a hand resizes
    ABSORBED store: .width 224 -> 237. Server keeps 224 for good. That is the
    cycle-33 signature.
  agent relabels the box a hand types in
    ABSORBED. Server: text 'written by the agent', rawText 'typed at 38',
    originalText 'written by the agent'; pane 'typed by the person'. Three
    values from three writes, which is the cycle-14 signature verbatim.
  agent recolours the box a hand deletes
    ABSORBED spare: gone from the scene, and the baseline entry with it, so the
    deletion can never be claimed. The server holds an element the pane does
    not — the cycle-31 signature.
  agent writes elsewhere while a hand moves a box
    NOT absorbed, and lost anyway. The baseline does not cover it so the debt
    stands, but the onChange the edit fired was suppressed and settle then took
    a fresh scene stamp, so nothing was left that would ever say it. This route
    is not in the report and one fix does not cover both.

THE FIX, both halves in the pane.

- The record is written at the moment of delivery, in the same statement
  sequence as updateScene, where nothing can have happened yet. It still reads
  the scene back rather than fingerprinting what was sent, because Excalidraw
  repairs a document as it takes it (syncInvalidIndices); the canary measured
  that read-back against the settle-time one over 810 deliveries and found no
  drift, which is what made this viable.
- settle restores the stamp the delivery left rather than the one the scene now
  holds, and then asks scheduleReport. The difference between the two is
  exactly what a hand did while nobody was listening, and the ordinary path
  takes it from there: it counts as a local edit, so a reply cannot overwrite
  it either, it takes the board, and it arms the debounce.

Nothing is written into the baseline inside settle any more, so settle takes no
callback at all.

REVERT-PROOF, against the four arranged cases:

  the record back in the settle timeout      9 fail, three named ABSORBED
  the fresh stamp and nothing asked         12 fail, all four named UNARMED
  both                                      12 fail, three ABSORBED, one UNARMED

TWO MORE OF THE SAME FAMILY, found by reasoning about the fixed tree rather
than measured, and closed rather than left as a rare flake:

- A report due while one is in flight is dropped with nothing rescheduled. If
  the reply then comes back with handMoved true there is no applyServerScene,
  so no settle, so no drain: the edit is owed and unarmed. Reachable whenever a
  round trip outlasts REPORT_DEBOUNCE_MS, which is what contention does — so
  this is TASK-097's load-dependent failure, and the same bug rather than a
  second one.
- A report due inside a suppression window is dropped the same way, and when
  the edit predates the delivery the drain cannot rescue it: delivered.stamp
  already contains it, so the stamp gate passes.

Both are one line: a due report is re-armed rather than dropped. That is not a
retry making a loss rarer — it makes 'owed implies armed' true by construction,
because the timer is never dropped.
<!-- SECTION:NOTES:END -->
