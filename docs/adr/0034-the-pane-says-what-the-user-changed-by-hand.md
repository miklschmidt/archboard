---
status: accepted
---

# The pane says what the user changed by hand, part by part

The voice model is told where the user's reading of a pane stands, and only
when the user moved it (pane news, TASK-293). That needs a cause, and a pane's
report has none: it is a settled snapshot of the whole reading, sent 150 ms
after the reading last changed. On 2026-09-20 every such report was appended to
the live voice session whoever caused it. A narrated walkthrough step changes
the reading, so each step the voice model asked for came back to it as news,
and it answered itself.

The pane states the cause, per part. A gesture marks the part it asks to change
(board, variant, view or selection), and the report in which that part really
differs carries the mark in `byUser` and uses it up. A part that changes without
a mark is told to nobody.

- **The pane, not the server.** Only the browser can tell a click from a change
  that reached it over its socket. A board the user opens from the picker and
  one an agent opens with `browser show` arrive at the pane as the same
  message, so the shell marks the board before it asks. The server inferring
  the cause from what it sent each pane, and when, was the alternative; it is a
  guess from timing, and it cannot see a pick, a view or a drill-down at all.
- **Per part, not per report.** One snapshot can hold the user's pick and a
  board version an agent just wrote. A single cause for the report would have
  to call one of them the other.
- **Deny by default.** Forgetting to mark a new gesture costs a sentence the
  voice model was not told. Forgetting to exclude a new driven change, under
  the opposite default, brings the loop back.

A pick or a view changes in the same moment as its gesture, so a mark the next
drawn report does not use is dropped: it was a click on what was already
selected, and must not wait for a change somebody else makes. A board or a
variant is asked of the server and arrives later, across a moment in which the
pane reads nothing, so those marks wait for a drawn reading, and are withdrawn
when the server refuses the move. A report sent again after a failure, or said
again after a reconnect, carries no marks.

The walkthrough position keeps `answering`, which already tells a step somebody
asked for from one the user chose (TASK-251). Focus needs no mark: nothing the
server sends moves the active pane, so a registration whose pane became the
focused one is the user's. A message that could move focus would have to carry
a cause before it shipped.
