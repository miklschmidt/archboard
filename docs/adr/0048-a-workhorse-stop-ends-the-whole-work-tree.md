---
status: accepted
---

# A workhorse stop ends the whole work tree

A workhorse stop ends its current work, stops every sub-agent that it spawned,
and clears its pending requests. Spoken requests and the workbench Stop
control use the same operation. Archboard reports success only after it
observes that the affected work ended. Missing turn information never proves
that work stopped.

Archboard stops every thread that it can reach and reports any work that
remains running or unconfirmed. It preserves the voice conversation and other
tab sessions. It refuses new work while the stop runs. After a successful
stop, work starts only from a fresh user request. A partial or unconfirmed
result prevents further work until Archboard establishes the outcome.

The user chose this scope after a spoken stop failed to reach the workhorse,
and a manual stop left its sub-agent running. Stopping one thread leaves
delegated activity outside the control that the user expects. Restarting the
shared Codex process also interrupts unrelated tab sessions.

Tracked for implementation in TASK-446.
