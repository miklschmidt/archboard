---
id: TASK-066
title: >-
  Timing constants are scattered, and two of them are in tension with nothing
  saying so
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:02'
updated_date: '2026-08-21 09:45'
labels: []
dependencies: []
references:
  - frontend/src/canvas/useCanvasSession.ts
  - src/core/change-feed.ts
  - docs/adr/0016-one-writer-at-a-time-per-board.md
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follows from ADR 0016.

The constants that govern flushing, settling, retrying and locking live in different files and cannot be read together:

  frontend/src/canvas/useCanvasSession.ts:34   REPORT_DEBOUNCE_MS = 400
  frontend/src/canvas/useCanvasSession.ts:35   REPORT_RETRY_MS = 2000
  frontend/src/canvas/useCanvasSession.ts:40   SELECTION_DEBOUNCE_MS = 150
  frontend/src/canvas/useCanvasSession.ts:47   PANE_DEBOUNCE_MS = 300
  src/core/change-feed.ts:62                   SETTLE_MS = 1200 (ARCHBOARD_SETTLE_MS)

plus the injection debounce and minimum interval, which are read from the environment and documented only in TESTING.md.

They are not independent. Under ADR 0016 the report debounce decides both how often the vault is written and how long an agent waits for a human who is mid-gesture, and those pull in opposite directions: shortening it releases the lock sooner and writes more often, and under ADR 0015 every write costs an fsync. Somebody tuning it for responsiveness will silently make the canvas write to the vault twice as often, and nothing in the file they are editing says so.

The frontend already imports src/core/labels and src/core/appearance directly, so a shared module is an established pattern here rather than a new one.

What belongs in it: the report debounce, the retry, the selection and pane debounces, the change feed settle, the lock lease and renewal interval, and the agent's wait cap. What belongs beside them: the relationships, so the next person to change one knows what else moves.

The environment overrides should keep working. ARCHBOARD_SETTLE_MS is documented and used.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Flush, settle, retry, lease and wait-cap constants live in one module imported by frontend, server and CLI
- [x] #2 The relationship between the report debounce and the lock hold is written down beside them
- [x] #3 Existing environment overrides still work
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find every duration that decides when a change is flushed, when a board is still, and how long anybody waits for either. Four in the pane's session hook, two in the change feed, two in the server's pane routes, two in the injection config, one inline socket reconnect.
2. Create src/core/timing.ts as a pure leaf: no process, no node: imports, so the pane can import it the way it already imports src/core/appearance. Numbers plus the reasons, and what each pulls against.
3. Environment overrides stay at the point of use, in the process that has an environment. The module holds the default. That also preserves when each override is read, which check-changes.mjs depends on: it sets ARCHBOARD_INJECT_DEBOUNCE_MS after change-feed.ts is already loaded.
4. Add the lease, the renewal interval and the wait cap now, unused, so TASK-067 has a home for them rather than defining them in the mutex.
5. Find check scripts carrying their own copy of a value. check-live-session.mjs sleeps 120 ms 'inside the pane's 400 ms debounce'; derive it from the constant.
6. Prove nothing moved: compare every value against its literal at HEAD, then run the full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fourteen constants now live in src/core/timing.ts, a pure leaf with no process, no node: imports and no behaviour, imported by frontend/src/canvas/useCanvasSession.ts, src/server.ts, src/core/change-feed.ts, src/core/injection.ts and scripts/check-live-session.mjs. It follows the path src/core/labels, src/core/appearance and src/core/expand-elements already cross.

Where each one lived: REPORT_DEBOUNCE_MS 400, REPORT_RETRY_MS 2000, SELECTION_DEBOUNCE_MS 150 and PANE_DEBOUNCE_MS 300 in useCanvasSession.ts (lines 34, 35, 40, 47, as filed); a bare 3000 inline in that file's socket onclose, now SOCKET_RECONNECT_MS; SETTLE_MS 1200 and MAX_PENDING_MS 6000 in change-feed.ts:62-63; PANE_LAYOUT_TIMEOUT_MS 10000 and PANE_SETTLE_CAP_MS 1500 in server.ts:1975 and :1986; the injection debounce 4000 and minimum interval 10000, literals inside injectionConfig(). LOCK_LEASE_MS 3000, LOCK_RENEW_MS 1000 and LOCK_WAIT_CAP_MS 5000 are new and unread, so TASK-067 has a home for them.

Environment overrides deliberately stayed at the point of use, with only the default moved. Two reasons. The module is imported by the browser, which has no process.env. And injectionConfig() reads its two per call: check-changes.mjs sets ARCHBOARD_INJECT_DEBOUNCE_MS after it has already imported change-feed.ts, so resolving those in a module the feed pulls in would have read them too early and made the check silently wrong.

The one duplicate found in the checks: check-live-session.mjs slept 120 ms with the comment 'Inside the pane's 400 ms debounce'. It now imports REPORT_DEBOUNCE_MS and takes 30 percent of it, which is the same 120 ms today. check-hot-reload.mjs (300), check-one-write.mjs (200) and check-changes.mjs (60000) each set ARCHBOARD_SETTLE_MS rather than copying the default, so they were already right. TESTING.md's knobs table repeats three defaults for reading and now says where they are set.

Not gathered, and why: IDENTITY_TTL_MS in canvas-client.ts is a security cache TTL, and the export and viewport request timeouts in server.ts are waits on a browser round trip. None of them pulls against anything in this file.

Gathering revealed three relationships beyond the one ADR 0016 names, all now written beside the constants: PANE_SETTLE_CAP_MS 1500 is waiting out PANE_DEBOUNCE_MS 300 on the far side of the browser boundary; SELECTION_DEBOUNCE_MS 150 under REPORT_DEBOUNCE_MS 400 is what makes an agent hear which boxes were picked up before it hears what happened to them; and LOCK_WAIT_CAP_MS has to stay above LOCK_LEASE_MS or an agent waiting on a crashed holder times out first and names a holder that no longer exists.

One correction to what ADR 0016 says, recorded on REPORT_DEBOUNCE_MS: the debounce bounds how long a human's hold lasts once it has been taken, not how long an agent waits, because scheduleReport is a trailing debounce with no maximum and nothing reaches the server at the start of a gesture. Until TASK-067 invents that message, the wait is one gesture plus the debounce.

Verification. A script read every value's literal out of git show HEAD:<file> and compared it against what timing.ts exports and what changeFeed.status() and injectionConfig() now compute: ten of ten unchanged, and injectionConfig() with the environment set still returns the environment's numbers. bun run type-check clean on both configs. bun run test:module-scope: 43 modules, no unwaived state, no waiver needed for this file. bun run test green, exit 0, 545 ok, 0 FAIL.

Honest note on the proof. Perturbing REPORT_DEBOUNCE_MS from 400 to 700 and running test:live-session still passes, so the suite does not pin these values and no check would have caught a number changing in the move. That is why the comparison against HEAD was done value by value instead.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-20 20:12
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: stands as written. Sequencing confirmed rather than changed.

All five constants verified at the lines the description names:
`frontend/src/canvas/useCanvasSession.ts:34` REPORT_DEBOUNCE_MS = 400, `:35`
REPORT_RETRY_MS = 2000, `:40` SELECTION_DEBOUNCE_MS = 150, `:47`
PANE_DEBOUNCE_MS = 300, and `src/core/change-feed.ts:62` SETTLE_MS = 1200 with
MAX_PENDING_MS = 6000 on the next line, which the description does not mention
and which belongs in the module too.

Sequencing. Do this before TASK-067, not after. The module has to exist for the
lease, the renewal interval and the wait cap to be added to it, and adding them
to the file that defines the mutex is exactly the scattering this task exists
to stop. TASK-067 now depends on it.

It does not depend on anything else. It can start today, alongside the batching
work, and it is the only item in the whole order that touches no behaviour.

One addition from the code, worth noting for whoever picks it up. ADR 0016 says
the report debounce now also bounds how long an agent waits for a human. That is
only true if something reaches the server when a gesture starts, and today
nothing does: `scheduleReport` at `frontend/src/canvas/useCanvasSession.ts:390`
is a trailing debounce with no maximum wait, restarted on every change, so a
continuous drag posts nothing at all until 400 ms after the finger lifts. The
relationship this task is asked to write down is therefore "the debounce bounds
how long a human's hold lasts once it has been taken", and taking it is a
separate immediate message that TASK-067 has to invent. Say that beside the
constant rather than the simpler thing the ADR says.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every duration that decides when a change is flushed, when a board is still, and how long anybody waits for either is now in src/core/timing.ts, with what each one pulls against written beside it. Fourteen constants gathered from five places, including one that was a bare literal inline. Nothing changed behaviour: a value-by-value comparison against the literals at HEAD found ten of ten unchanged, environment overrides still resolve, and bun run test is green at 545 ok, 0 FAIL. The lease, the renewal interval and the wait cap are there and unread, so TASK-067 builds the mutex without defining them inside it.
<!-- SECTION:FINAL_SUMMARY:END -->
