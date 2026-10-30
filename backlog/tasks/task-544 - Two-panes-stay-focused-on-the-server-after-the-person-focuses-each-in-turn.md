---
id: TASK-544
title: Two panes stay focused on the server after the person focuses each in turn
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T21:46:00Z'
updated_date: '2026-10-25T22:13:00Z'
labels:
  - frontend
  - bug
dependencies: []
type: bug
ordinal: 950000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a person focuses one pane and then the other, the server still counts both panes as focused. An agent that runs `archboard browser show <board> --pane focused` is then refused with `"focused" matches 2 panes (left, right)`, so it cannot reach the pane the person is looking at. The browser lane test "the dock follows the pane the person focuses, not an agent's show, and its list picks a conversation" (tests/system/browser/codex-text-workbench.test.ts:444) fails steadily on branch feat/architecture-insight-ux, also on the code before 20441874c. c223a3023 (TASK-538.02) fixed the same symptom once: it moved pane-link state out of render, because a state set during the shell render made the server see both panes focused. That fix no longer holds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a person focuses pane A and then pane B, the server reports only pane B as focused
- [x] #2 `browser show --pane focused` reaches the pane the person focused last
- [x] #3 The dock test in tests/system/browser/codex-text-workbench.test.ts passes, with every assertion and timeout unchanged
- [x] #4 The task notes name the observed cause and the commit that brought the failure back
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Report a change to which pane the person focused at once, beside the debounced report, in the pane core.
2. Own the behaviour with a unit test in pane-connection.test.ts: a focus change reaches the server without the debounce.
3. Run the dock browser test, lint, type-check and format the touched files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: a pane told the server about a focus change only through its 300 ms report debounce. Every redraw of a pane starts that debounce again, because the pane session calls facetsChanged whenever its options object changes. In the dock test, opening pane B took focus from pane A at 482 ms. Pane A was drawn again at 777 ms, when pane B moved to ledger and the link between the two panes ended (the views log said readings,links changed). That postponed pane A's report. The person's clicks came at 1049 ms and 1085 ms and postponed it again. So the server still held pane A as focused (from its report at 464 ms) beside pane B when the test ran browser show --pane focused, and the command was refused.

Evidence: tagged server logging of every POST /api/panes showed one report from pane A, focused=true, and none after pane B opened, before the refusal. Browser counters showed pane A's options effect ran again at 777 ms after views:readings,links changed. With a 2 s wait added after the clicks, pane A's focused=false report reached the server at the end of the debounce and the test passed. All probes are removed.

Which commit: e57e8945b (feat(web): a part picked in one pane is picked in the pane beside it, TASK-538.02) brought the failure. It made every pane draw again when the link between the panes changes. The dock test passes at 814c0eedf (e57e8945b^) and fails at e57e8945b, at 9a101c764 (c223a3023^) and at c223a3023. So c223a3023 never made the test pass. Its links derivation is fine, but a link that really changes still draws both panes again.

Fix: the pane core sends a report at once when the focused flag changed since the last facet change, and then arms the debounce as before, so the pane's place on screen is still measured after a layout settles. A unit test in apps/web/tests/ui/state/pane-session/pane-connection.test.ts owns it: a pane that loses focus reports focused=false without the debounce.

Brought onto feat/architecture-insight-ux as 83e7f0c2c. Without the four new lines in facetsChanged the new unit test fails, and with them it passes (checked on this branch). Gate after the fix: bun run check stops only on the two waived wide-boards layout timing tests (4958 pass). test:system 257 pass, test:repository 142 pass, test:serial-browser all pass, the dock test included. The dock test file is unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pane now reports a change of focus to the server at once, beside its debounced report. Every redraw restarted the 300 ms debounce, and since e57e8945b a change of the pane link redraws both panes, so the report that pane A lost focus came after the clicks, and browser show --pane focused found two focused panes. A unit test in pane-connection.test.ts owns it, and the dock browser test passes again.
<!-- SECTION:FINAL_SUMMARY:END -->
