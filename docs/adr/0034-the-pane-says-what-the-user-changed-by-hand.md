---
status: accepted
---

# The pane says what the user changed by hand, part by part

Only a move by the user tells the voice model where the user's reading of a pane
stands (pane news, TASK-293). That needs a cause. A pane's report has no cause.
It is a settled snapshot of the whole reading, sent 150 ms after the reading
last changed. On 2026-09-20 the live voice session received every such report,
whoever caused it. A narrated walkthrough step changes the reading. So each step
the voice model asked for came back to it as news, and it answered itself.

The pane states the cause, per part. A gesture marks the part it asks to change
(board, variant, view or selection). The report in which that part really
differs carries the mark in `byUser` and uses it up. The pane tells nobody about
a part that changes without a mark. Three choices shape this design:

- The pane states the cause, not the server, because only the browser can tell a
  click from a change that reached it over its socket. A board the user opens
  from the picker and one an agent opens with `browser show` arrive at the pane
  as the same message. So the shell marks the board before it asks. The
  alternative was that the server infers the cause from what it sent each pane,
  and when. That is a guess from timing, and it cannot see a pick, a view or a
  drill-down at all.
- The mark applies per part, not per report. One snapshot can hold the user's
  pick and a board version an agent just wrote. A single cause for the report
  must call one of them the other.
- Deny by default is the rule. If somebody forgets to mark a new gesture, the
  voice model misses a sentence it was not told. If somebody forgets to exclude
  a new driven change under the opposite default, the loop comes back.

A pick or a view changes in the same moment as its gesture. So the pane drops a
mark that the next drawn report does not use. It was a click on what was already
selected, and it must not wait for a change somebody else makes. The pane asks
the server for a board or a variant, and the change arrives later, across a
moment in which the pane reads nothing. So those marks wait for a drawn reading.
If the server refuses the move, the pane withdraws them. A report sent again
after a failure, or said again after a reconnect, carries no marks.

The walkthrough position keeps `answering`, which already tells a step somebody
asked for from one the user chose (TASK-251). Focus needs no mark, because
nothing the server sends moves the active pane. So a registration whose pane
became the focused one is the user's. A message that can move focus must carry a
cause before it ships.
